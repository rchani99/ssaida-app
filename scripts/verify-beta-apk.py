"""Read-only verification of the beta APK. Never extracts or prints credentials."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument("apk", type=Path)
parser.add_argument("--build-tools", required=True, type=Path)
parser.add_argument("--production-ref", required=True)
parser.add_argument("--expected-cert-sha256", required=True)
parser.add_argument("--minimum-version-code", required=True, type=int)
parser.add_argument("--report", required=True, type=Path)
args = parser.parse_args()
if not re.fullmatch(r"[a-z]{20}", args.production_ref):
    raise SystemExit("Invalid production project reference")

apk = args.apk.resolve(strict=True)
tools = args.build_tools.resolve(strict=True)
expected_cert = args.expected_cert_sha256.replace(":", "").lower()
if not re.fullmatch(r"[a-f0-9]{64}", expected_cert):
    raise SystemExit("Invalid expected signing certificate fingerprint")


def run(executable, *arguments):
    result = subprocess.run([str(executable), *map(str, arguments)],
                            capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode:
        raise SystemExit("Android verification command failed; check SDK/JAVA_HOME and APK integrity")
    return result.stdout


badging = run(tools / ("aapt2.exe" if os.name == "nt" else "aapt2"), "dump", "badging", apk)
package = re.search(r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'", badging)
if not package or package[1] != "com.ssaida.app":
    raise SystemExit("Unexpected Android package")
if int(package[2]) < args.minimum_version_code or "application-debuggable" in badging:
    raise SystemExit("APK must be release mode with the expected versionCode")
certificates = run(tools / ("apksigner.bat" if os.name == "nt" else "apksigner"),
                   "verify", "--verbose", "--print-certs", apk)
certificate = re.search(r"Signer #1 certificate SHA-256 digest: ([a-fA-F0-9]+)", certificates)
sha1 = re.search(r"Signer #1 certificate SHA-1 digest: ([a-fA-F0-9]+)", certificates)
if not certificate or certificate[1].lower() != expected_cert:
    raise SystemExit("Signing certificate differs from the expected EAS release key")

report = {"apk": str(apk), "bytes": apk.stat().st_size,
          "sha256": hashlib.sha256(apk.read_bytes()).hexdigest(),
          "package": package[1], "versionCode": int(package[2]), "versionName": package[3],
          "debuggable": False, "signatureVerified": True,
          "certificateSha256": certificate[1].lower(), "certificateSha1": sha1[1].lower() if sha1 else None}
report["permissions"] = re.findall(r"uses-permission: name='([^']+)'", badging)

with zipfile.ZipFile(apk) as archive:
    if archive.testzip():
        raise SystemExit("APK ZIP integrity check failed")
    names = archive.namelist()
    if any(Path(name).suffix.lower() in (".jks", ".keystore", ".p12", ".p8", ".key") or
           Path(name).name == ".env" or Path(name).name.startswith(".env.") for name in names):
        raise SystemExit("Unexpected private configuration/signing file in APK")
    config = json.loads(archive.read("assets/app.config"))
    if config.get("extra", {}).get("appEnvironment") != "production" or config.get("scheme") != "ssaida":
        raise SystemExit("APK Expo configuration is not the expected production build")
    bundle = archive.read("assets/index.android.bundle")
    production_url = f"https://{args.production_ref}.supabase.co".encode()
    if production_url not in bundle:
        raise SystemExit("Expected production endpoint missing from JS bundle")
    if b"https://ffnxodulitwzuqswlaga.supabase.co" in bundle:
        raise SystemExit("DEV Supabase endpoint found in JS bundle")
    # Guard lists and React Native library strings may mention localhost/DEV refs;
    # those are not selected connection settings. The config regression verifies
    # that release clients reject them. Scan actual credentials, not variable names.
    for name in names:
        if not name.startswith("assets/"):
            continue
        content = archive.read(name)
        if re.search(rb"\b(?:sb_secret_|re_)[A-Za-z0-9_-]{24,}", content) or re.search(
                rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\s+[A-Za-z0-9+/=\r\n]{64,}", content):
            raise SystemExit("Potential server credential in APK assets; do not distribute")
        for token in re.findall(rb"eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}", content):
            try:
                payload = token.split(b".")[1]
                claims = json.loads(base64.urlsafe_b64decode(payload + b"=" * (-len(payload) % 4)))
            except (ValueError, UnicodeDecodeError):
                continue
            if claims.get("role") == "service_role":
                raise SystemExit("Service-role credential in APK; do not distribute")
    report.update({"zipIntegrity": True, "embeddedJsBundle": True,
                   "expoEnvironment": "production", "expectedProductionEndpoint": True,
                   "devSupabaseEndpointFound": False, "credentialPatternsFound": False,
                   "deviceLoginVerified": False, "deviceSmokeTestVerified": False})

args.report.parent.mkdir(parents=True, exist_ok=True)
args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2))
