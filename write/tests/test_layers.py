"""官方层与经验层的格式：编号唯一、每条有链接和日期、不带账号名。仅用标准库。"""
from pathlib import Path
import re
import unittest

REF = Path(__file__).resolve().parents[1] / 'references'
DATE = re.compile(r'\d{4}-\d{2}-\d{2}')


def rows(path):
    """表格数据行（去掉表头与分隔行），每行切成单元格。"""
    out = []
    for line in path.read_text(encoding='utf-8').splitlines():
        if not line.startswith('|') or re.match(r'^\|[-\s|]+\|$', line):
            continue
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        if cells[0] in ('G 编号', 'E 编号'):
            continue
        out.append(cells)
    return out


def header(path):
    m = re.match(r'---\n(.*?)\n---\n', path.read_text(encoding='utf-8'), re.S)
    return dict(l.split(':', 1) for l in m.group(1).splitlines()) if m else {}


class OfficialLayer(unittest.TestCase):
    path = REF / 'official/google-content.md'

    def test_header(self):
        value = header(self.path).get('last_verified', '').strip()
        self.assertTrue(value == '未并入' or DATE.fullmatch(value), value)

    def test_rows(self):
        data = rows(self.path)
        if header(self.path)['last_verified'].strip() != '未并入':
            self.assertTrue(data, '已并入却没有条目')
        ids = [r[0] for r in data]
        self.assertEqual(len(ids), len(set(ids)), '编号重复')
        for r in data:
            with self.subTest(row=r[0]):
                self.assertRegex(r[0], r'^G\d{2,3}$')
                self.assertEqual(len(r), 7, '列数应为 7')
                self.assertTrue(r[2], '缺「写的时候怎么做」')
                self.assertRegex(r[4], r'\]\(https://[^)]+\)')
                self.assertRegex(r[5], DATE)
                self.assertRegex(r[6], DATE)


class PracticeLayer(unittest.TestCase):
    path = REF / 'practice/site-seo-notes.md'

    def test_rows(self):
        data = rows(self.path)
        ids = [r[0] for r in data]
        self.assertEqual(len(ids), len(set(ids)), '编号重复')
        for r in data:
            with self.subTest(row=r[0]):
                self.assertRegex(r[0], r'^E\d{2,3}$')
                self.assertEqual(len(r), 6, '列数应为 6')
                self.assertRegex(r[3], r'^(实测|实测·第三方|经验|观点)')
                self.assertTrue(re.search(r'\]\(https://[^)]+\)', r[4]) or r[4] == '无外部来源', r[4])
                self.assertRegex(r[5], DATE)

    def test_no_account_names_in_links(self):
        text = self.path.read_text(encoding='utf-8')
        for link in re.findall(r'https://(?:x|twitter)\.com/[^)\s]+', text):
            with self.subTest(link=link):
                self.assertRegex(link, r'^https://(?:x|twitter)\.com/i/status/\d+$')


if __name__ == '__main__':
    unittest.main()
