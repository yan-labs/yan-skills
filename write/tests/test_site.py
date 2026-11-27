"""站内页面：front matter 的 title/description、--json 稿件包、--meta 长度与重复。仅用标准库。"""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/check.py'


def run(*args, stdin=''):
    return subprocess.run([sys.executable, str(SCRIPT), *args], input=stdin,
                          text=True, capture_output=True)


class SiteChecks(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, name, text):
        p = self.dir / name
        p.write_text(text, encoding='utf-8')
        return str(p)

    def test_markdown_site_examples_enable_front_matter(self):
        root = Path(__file__).resolve().parents[1]
        site = (root / 'references/cards/site-page.md').read_text()
        review = (root / 'references/cards/review.md').read_text()
        check = (root / 'references/check.md').read_text()
        self.assertIn('check.py --check-front-matter --meta', site)
        self.assertIn('--check-front-matter --meta', review)
        self.assertIn('check.py --check-front-matter --meta pages/*.md', check)
        self.assertIn('检查带 front matter 的 Markdown 站内页面时加 `--check-front-matter`', check)

    def test_front_matter_title_dash(self):
        text = ('---\ntitle: PDF Merger — Free Online Tool\n'
                'description: Merge PDF files online for free.\n---\n\n'
                'Drop two PDF files and download one merged file.\n')
        self.assertEqual(run(stdin=text).returncode, 0)
        r = run('--check-front-matter', stdin=text)
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn('[硬禁] 破折号 x1', r.stdout)
        self.assertIn('L2:', r.stdout)

    def test_front_matter_quoted_and_block_values(self):
        text = ('---\ntitle: "PDF Merger — Free"\ndescription: |\n'
                '  It is not just a merger, it is a workspace.\n---\n\nBody text here.\n')
        r = run('--check-front-matter', '--lang', 'en', stdin=text)
        self.assertIn('[硬禁] 破折号', r.stdout)
        self.assertIn('[硬禁] 翻案腔', r.stdout)

    def test_front_matter_other_keys_stay_masked(self):
        text = ('---\ntitle: Merge PDF files online\nslug: not-a-tool--but-a-partner\n'
                'tags: It is not just a tool, it is a partner\n---\n\nDrop two PDF files.\n')
        r = run('--lang', 'en', stdin=text)
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertNotIn('[硬禁]', r.stdout)

    def test_json_values_are_checked(self):
        page = {'path': '/merge-pdf', 'kind': 'page', 'status': 'draft',
                'title': 'PDF Merger — Free', 'description': 'Merge PDF files online.',
                'content': {'faq': [{'q': 'Is it free?', 'a': 'It is not just free, it is unlimited.'}]}}
        f = self.write('page.json', json.dumps(page, ensure_ascii=False))
        plain = run(f)
        self.assertEqual(plain.returncode, 0, '不加 --json 时 JSON 引号内文字被整段屏蔽')
        r = run('--json', f)
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn('$.title:', r.stdout)
        self.assertIn('$.content.faq[0].a:', r.stdout)
        self.assertNotIn('$.path', r.stdout)

    def test_json_chinese_values(self):
        page = {'title': '合并 PDF——免费', 'body': '这个工具不是帮你多做，而是帮你少做。'}
        r = run('--json', self.write('zh.json', json.dumps(page, ensure_ascii=False)))
        self.assertEqual(r.returncode, 1)
        self.assertIn('[硬禁] 破折号', r.stdout)
        self.assertIn('[硬禁] 翻案腔', r.stdout)

    def test_meta_lengths_and_duplicates_are_hints_only(self):
        pages = [{'path': '/a', 'title': 'Merge PDF files online for free | PDFTool',
                  'description': 'Combine several PDF files into one document in your browser, with no sign-up needed.'},
                 {'path': '/b', 'title': 'Merge PDF files online for free | PDFTool',
                  'description': 'Short one.'},
                 {'path': '/c', 'description': 'Combine several PDF files into one document in your browser, with no sign-up needed.'}]
        r = run('--json', '--meta', self.write('pages.json', json.dumps(pages)))
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn('[meta] /a：title 41 字符｜description 84 字符', r.stdout)
        self.assertIn('[提示] /b description 10 字符，不在经验区间 70–160（非官方要求）', r.stdout)
        self.assertIn('[提示] /c 缺 title', r.stdout)
        self.assertIn('[提示] title 重复：/a、/b', r.stdout)
        self.assertIn('[提示] description 重复：/a、/c', r.stdout)

    def test_meta_across_markdown_files(self):
        fm = '---\ntitle: Merge PDF on Mac without extra apps\ndescription: {}\n---\n\nSteps follow.\n'
        a = self.write('a.md', fm.format('Use Preview on a Mac to merge PDF files in a few clicks, no download.'))
        b = self.write('b.md', fm.format('Use Preview on a Mac to merge PDF files in a few clicks, no download.'))
        r = run('--meta', a, b)
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn(f'== {a}', r.stdout)
        self.assertIn(f'title 重复：{a}、{b}', r.stdout)

    def test_any_file_with_hard_hit_fails_batch(self):
        good = self.write('good.md', 'Drop two PDF files and download one file.\n')
        bad = self.write('bad.md', 'Drop two PDF files — download one file.\n')
        self.assertEqual(run(good).returncode, 0)
        self.assertEqual(run(good, bad).returncode, 1)

    def test_clean_rejects_batch_modes(self):
        f = self.write('x.json', '{}')
        self.assertEqual(run('--clean', '--json', f).returncode, 2)


if __name__ == '__main__':
    unittest.main()
