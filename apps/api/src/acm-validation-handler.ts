/**
 * CloudFormation Custom Resource: creates the Route 53 CNAME record required
 * for ACM certificate DNS validation (GetAtt DomainValidationOptions is not supported).
 */
import { ACMClient, DescribeCertificateCommand } from "@aws-sdk/client-acm";
import {
  Route53Client,
  ChangeResourceRecordSetsCommand,
  ChangeAction,
  RRType,
} from "@aws-sdk/client-route-53";
import https from "https";

const acm = new ACMClient({ region: "us-east-1" });
const route53 = new Route53Client({});

type CloudFormationEvent = {
  RequestType: "Create" | "Update" | "Delete";
  ResponseURL: string;
  StackId: string;
  RequestId: string;
  ResourceType: string;
  LogicalResourceId: string;
  PhysicalResourceId?: string;
  ResourceProperties?: {
    CertificateArn?: string;
    HostedZoneId?: string;
  };
};

const POLL_INTERVAL_MS = 15_000;
const MAX_ATTEMPTS = 12; // 12 * 15s = 3 minutes

async function getValidationRecord(certificateArn: string): Promise<{
  Name: string;
  Type: string;
  Value: string;
}> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const out = await acm.send(
      new DescribeCertificateCommand({ CertificateArn: certificateArn })
    );
    const opts = out.Certificate?.DomainValidationOptions;
    if (opts?.length && opts[0].ResourceRecord) {
      const rr = opts[0].ResourceRecord;
      if (rr.Name && rr.Type && rr.Value) {
        return { Name: rr.Name, Type: rr.Type, Value: rr.Value };
      }
    }
    if (attempt < MAX_ATTEMPTS) {
      console.log(
        `ACM validation options not ready (attempt ${attempt}/${MAX_ATTEMPTS}), waiting ${POLL_INTERVAL_MS / 1000}s...`
      );
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
  throw new Error(
    "Certificate DomainValidationOptions never became available (ACM can take 1–2 minutes after certificate create)"
  );
}

async function createValidationRecord(
  hostedZoneId: string,
  name: string,
  type: string,
  value: string
): Promise<void> {
  await route53.send(
    new ChangeResourceRecordSetsCommand({
      HostedZoneId: hostedZoneId,
      ChangeBatch: {
        Changes: [
          {
            Action: ChangeAction.UPSERT,
            ResourceRecordSet: {
              Name: name,
              Type: type as RRType,
              TTL: 300,
              ResourceRecords: [{ Value: value }],
            },
          },
        ],
      },
    })
  );
}

function sendResponse(
  event: CloudFormationEvent,
  status: "SUCCESS" | "FAILED",
  physicalId: string,
  reason?: string
): Promise<void> {
  const body = JSON.stringify({
    Status: status,
    Reason: reason || (status === "SUCCESS" ? "OK" : "Unknown"),
    PhysicalResourceId: physicalId,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
  });
  const u = new URL(event.ResponseURL);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: u.hostname,
        port: 443,
        path: u.pathname + u.search,
        method: "PUT",
        headers: { "Content-Type": "", "Content-Length": Buffer.byteLength(body) },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300)
          resolve();
        else reject(new Error(`Response ${res.statusCode}`));
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export async function handler(event: CloudFormationEvent): Promise<void> {
  const { RequestType, ResourceProperties } = event;
  const certArn = ResourceProperties?.CertificateArn;
  const hostedZoneId = ResourceProperties?.HostedZoneId;
  const physicalId = event.PhysicalResourceId || certArn || "acm-validation";

  const respond = (status: "SUCCESS" | "FAILED", reason?: string) =>
    sendResponse(event, status, physicalId, reason);

  if (RequestType === "Delete") {
    await respond("SUCCESS");
    return;
  }

  if (!certArn || !hostedZoneId) {
    await respond("FAILED", "CertificateArn and HostedZoneId required");
    return;
  }

  try {
    const record = await getValidationRecord(certArn);
    await createValidationRecord(
      hostedZoneId,
      record.Name,
      record.Type,
      record.Value
    );
    await respond("SUCCESS");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("ACM validation record failed:", message);
    await respond("FAILED", message);
    throw err;
  }
}
