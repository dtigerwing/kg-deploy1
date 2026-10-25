"""엑셀 일정표의 한 탭을 2차원 격자(JSON)로 변환한다.

구글 Sheets API(values.get)가 돌려주는 모양과 같게 맞춰서,
나중에 시트 연결로 바꿔도 사이트의 파서는 그대로 쓴다.
  - 행마다 문자열 배열, 빈 칸은 "", 각 행 끝의 빈 칸은 잘라냄
  - 병합된 칸은 왼쪽 위 칸에만 값이 있음
  - 정수로 떨어지는 숫자는 "29.0"이 아니라 "29"

사용법: python3 -I scripts/xlsx_to_grid.py <엑셀 경로> [탭 이름] [출력 경로]
"""
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def col_index(ref):
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group():
        n = n * 26 + ord(ch) - 64
    return n - 1


def shared_strings(z):
    if "xl/sharedStrings.xml" not in z.namelist():
        return []
    root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    return ["".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])) for si in root.findall("m:si", NS)]


def sheet_path(z, name):
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    targets = {r.get("Id"): r.get("Target") for r in rels}
    names = []
    for s in wb.find("m:sheets", NS):
        names.append(s.get("name"))
        if s.get("name") == name:
            target = targets[s.get("{%s}id" % REL_NS)].lstrip("/")
            return target if target.startswith("xl/") else "xl/" + target
    sys.exit(f"'{name}' 탭이 없습니다. 있는 탭: {names}")


def cell_text(c, ss):
    t = c.get("t")
    if t == "inlineStr":
        return "".join(x.text or "" for x in c.iter("{%s}t" % NS["m"]))
    v = c.find("m:v", NS)
    if v is None or v.text is None:
        return ""
    if t == "s":
        return ss[int(v.text)]
    if t in (None, "n"):
        f = float(v.text)
        return str(int(f)) if f.is_integer() else v.text
    return v.text


def read_grid(xlsx, name):
    z = zipfile.ZipFile(xlsx)
    ss = shared_strings(z)
    root = ET.fromstring(z.read(sheet_path(z, name)))
    grid = []
    for row in root.iter("{%s}row" % NS["m"]):
        r = int(row.get("r")) - 1
        while len(grid) <= r:
            grid.append([])
        cells = grid[r]
        for c in row.findall("m:c", NS):
            text = cell_text(c, ss)
            if not text:
                continue
            i = col_index(c.get("r"))
            while len(cells) <= i:
                cells.append("")
            cells[i] = text
    while grid and not grid[-1]:
        grid.pop()
    return grid


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    xlsx = sys.argv[1]
    name = sys.argv[2] if len(sys.argv) > 2 else "2026 하반기"
    out = sys.argv[3] if len(sys.argv) > 3 else "public/data/grid.json"
    grid = read_grid(xlsx, name)
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"sheet": name, "values": grid}, f, ensure_ascii=False)
    print(f"{name}: {len(grid)}행 → {out}")


if __name__ == "__main__":
    main()
