"""Inspect the actual optimized AAB/APK, not just app-source call sites.

Usage: python tools/check_edge_to_edge_bundle.py path/to/app-release.aab
The deprecated color setters must be absent from all DEX method tables.
"""
import argparse
import json
import re
import struct
import zipfile


def inspect(path):
    calls = []
    old_helpers = []
    cutout_fields = []
    with zipfile.ZipFile(path) as archive:
        for name in archive.namelist():
            if name.endswith("proguard.map"):
                for line in archive.read(name).decode("utf-8").splitlines():
                    if re.match(r"androidx\.activity\.EdgeToEdgeApi\d+ -> ", line):
                        old_helpers.append(line.split(" -> ")[0])
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
            for index in range(uint(80)):
                owner, _, field = struct.unpack_from("<HHI", data, uint(84) + index * 8)
                if types[owner] == "Landroid/view/WindowManager$LayoutParams;" and strings[field] == "layoutInDisplayCutoutMode":
                    cutout_fields.append(name)
            for index in range(uint(88)):
                owner, _, method = struct.unpack_from("<HHI", data, uint(92) + index * 8)
                if types[owner] == "Landroid/view/Window;" and strings[method] in {
                    "setStatusBarColor", "setNavigationBarColor"
                }:
                    calls.append({"dex": name, "method": strings[method]})
    return {"bundle": str(path), "deprecated_color_method_references": calls,
            "retained_activity_edge_to_edge_helpers": old_helpers,
            "programmatic_cutout_field_references": cutout_fields}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle")
    args = parser.parse_args()
    result = inspect(args.bundle)
    print(json.dumps(result, indent=2))
    raise SystemExit(1 if result["deprecated_color_method_references"] or
                     result["retained_activity_edge_to_edge_helpers"] else 0)
