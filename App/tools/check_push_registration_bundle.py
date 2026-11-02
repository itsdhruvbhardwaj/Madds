"""Verify the registration DTO's reflective JSON fields in an actual AAB/APK.

Run after release optimization, not just against debug classes:
    python tools/check_push_registration_bundle.py app/build/outputs/bundle/release/app-release.aab
"""
import argparse
import json
import struct
import zipfile

DTO = "Lcom/itsdhruvbhardwaj/picme/notifications/PushDeviceRequest;"
EXPECTED = {"deviceId": "Ljava/lang/String;", "bindingVersion": "J",
            "fcmToken": "Ljava/lang/String;", "permissionGranted": "Z"}


def inspect(path):
    found = []
    with zipfile.ZipFile(path) as archive:
        for name in archive.namelist():
            if not name.endswith(".dex"):
                continue
            data = archive.read(name)

            def uint(offset):
                return struct.unpack_from("<I", data, offset)[0]

            strings = []
            for index in range(uint(56)):
                offset = uint(uint(60) + index * 4)
                while data[offset] & 128:
                    offset += 1
                offset += 1
                strings.append(data[offset:data.index(b"\0", offset)].decode("utf-8", "replace"))
            types = [strings[uint(uint(68) + index * 4)] for index in range(uint(64))]
            fields = {}
            for index in range(uint(80)):
                owner, field_type, field = struct.unpack_from("<HHI", data, uint(84) + index * 8)
                if types[owner] == DTO:
                    fields[strings[field]] = types[field_type]
            if fields:
                found.append({"dex": name, "fields": fields})
    valid = len(found) == 1 and all(found[0]["fields"].get(key) == value for key, value in EXPECTED.items())
    return {"artifact": str(path), "registration_contract_preserved": valid, "matches": found}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifact")
    result = inspect(parser.parse_args().artifact)
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result["registration_contract_preserved"] else 1)
