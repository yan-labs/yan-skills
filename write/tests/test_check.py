"""固定英文用例与修改前中文 CLI 快照；仅使用标准库。"""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/check.py'
spec = importlib.util.spec_from_file_location('write_check', SCRIPT)
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


def run(text, *args):
    return subprocess.run([sys.executable, str(SCRIPT), *args], input=text,
                          text=True, capture_output=True)


class EnglishCheck(unittest.TestCase):
    def test_reversals(self):
        hard = [
            'It is not just a tool, it is a game-changer — try it.',
            "It's not just an editor, it's a partner.",
            'NOT ONLY STORAGE, BUT A WORKSPACE.',
            'Not merely a folder; this is a workspace.',
            'Not simply a search box. That is a workspace.',
            'Not just a team. They are a family.',
            'Not just readers\nwe are builders.',
            'Not just storage. Instead, a workspace.',
            'Not just storage; rather, a workspace.',
            'Not just storage, a workspace.',
            'More than just storage.',
            "It isn't about speed, it's about trust.",
            "It's not about speed. It is about trust.",
            'It is not about speed; but about trust.',
            'Not a tool but a partner.',
            'Not a tool. But a partner.',
            "Latency isn't the problem, the queue is.",
            'Latency is not the problem. The queue is.',
            'No longer a tool, now a partner.',
            'No longer a tool\nnow a partner.',
            'It is not just a tool, it is a game-changer.',
            'This isn’t about speed; it’s about trust.',
            'It’s more than just a tool.',
            'It is not a tool, this is a workspace.',
            'It is not a tool, that’s a workspace.',
            'Not X but rather Y.',
            'Not X, instead Y.',
        ]
        for text in hard:
            with self.subTest(text=text):
                self.assertTrue(list(check.locate(check.mask_en_quotes(check.mask(text)),
                                                 check.EN_HARD['翻案腔'], check.re.I)))
                self.assertEqual(run(text, '--lang', 'en').returncode, 1)
        uncertain = [
            "It isn't a tool, it's a partner.",
            "It is not a tool; it is a partner.",
            "It's not a tool. It is a partner.",
            "This isn't a tool\nit's a partner.",
            "That's not a tool, but a partner.",
            "We aren't sellers, we are builders.",
            "They don't sell files; instead they sell trust.",
        ]
        for text in uncertain:
            with self.subTest(text=text):
                r = run(text, '--lang', 'en')
                self.assertRegex(r.stdout, r'\[(?:硬禁|提示)\] (?:疑似翻案|翻案腔)')

    def test_normal_and_protected(self):
        normal = [
            'She did not call, but she wrote.',
            'It was not a bad idea, but it was slow.',
            'I do not want tea, but coffee is fine.',
            'It is not a bad idea, but it is slow.',
            'She does not call, but she writes.',
            'She didn’t call, but she wrote.',
            'It is not raining.',
            "This isn't available yet.",
            "We aren't ready for release.",
            "They don't store passwords.",
            'Not only speed but also accuracy matters.',
            'It is not only fast, but also accurate.',
            'Not only fast. But also accurate.',
            'The export failed because the disk was full.',
            'The notice says "not a tool but a partner".',
            'The notice says “It is not just a tool, it is a partner.”',
            "The notice says 'not a tool but a partner'.",
            '> It is not just a tool, it is a partner.',
            '```text\nnot a tool but a partner\n```',
            '~~~text\nnot a tool but a partner\n~~~',
            '`not a tool but a partner`',
            "The notice says 'It isn't about speed, it's about trust.'",
            "The notice says ‘It isn’t about speed, it’s about trust.’",
            'The notice says "Not just storage.\nIt is a workspace."',

        ]
        for text in normal:
            with self.subTest(text=text):
                r = run(text, '--lang', 'en')
                self.assertEqual(r.returncode, 0, r.stdout)
                self.assertNotIn('[硬禁]', r.stdout)
        for text in normal[:6]:
            with self.subTest(concession=text):
                self.assertIn('[提示] 疑似翻案（可能是让步句，如是在重新定义主体请改写）',
                              run(text, '--lang', 'en').stdout)
        r = run('> not a tool but a partner\nNot a file but a workspace.', '--lang', 'en')
        self.assertIn('[硬禁] 翻案腔 x1', r.stdout)
        self.assertIn('L2:', r.stdout)

    def test_other_patterns(self):
        cases = {
            "Whether you’re a writer or a designer, start here.": '[提示] 泛指开头',
            'Whether you are new or experienced, start here.': '[提示] 泛指开头',
            "In today’s digital landscape, teams need notes.": '[提示] 套话开头收尾',
            "In today's connected world, teams need notes.": '[提示] 套话开头收尾',
            "It’s worth noting that exports take time.": '[硬禁] 口头路标',
            'It is worth noting that exports take time.': '[硬禁] 口头路标',
            "Let’s dive in.": '[硬禁] 口头路标',
            "Let's delve into the details.": '[硬禁] 口头路标',
            'In conclusion, save the file.': '[提示] 套话开头收尾',
            'Ultimately, save the file.': '[提示] 套话开头收尾',
            'We build. We test. We ship.': '[节奏] 连续三句同一开头',
            'You can upload. You can edit. You can export.': '[节奏] 连续三句同一开头',
            'Certainly! Here is your revised copy.': '[提示] 客服与聊天残留',
            'Experts agree this marks a new era.': '[提示] 比喻与借权威',
            'A lighthouse in the ocean of data.': '[提示] 比喻与借权威',
        }
        for text, expected in cases.items():
            with self.subTest(text=text):
                self.assertIn(expected, run(text, '--lang', 'en').stdout)

    def test_drafts(self):
        bad = run((ROOT / 'tests/bad-en.md').read_text())
        self.assertEqual(bad.returncode, 1)
        self.assertIn('[硬禁] 翻案腔', bad.stdout)
        good = run((ROOT / 'tests/clean-en.md').read_text())
        self.assertEqual(good.returncode, 0)
        self.assertIn('无命中', good.stdout)

    def test_clean_punctuation(self):
        text = "Save, edit; share: why? Yes! 中文,保留; 'quoted' — --.\n`code,;:?!`  \n"
        for args in [('--lang', 'en', '--clean'), ('--clean',)]:
            with self.subTest(args=args):
                r = run(text, *args)
                self.assertEqual(r.returncode, 0)
                self.assertEqual(r.stdout, text.replace('  \n', '\n'))
        self.assertEqual(check.clean('Save\u00a0your\u200b file.  \n', 'en'), 'Save your file.\n')

    def test_chinese_baseline(self):
        # c6243bf 版本对中文参考文件生成的 stdout SHA-256 与退出码。
        # 参考文件会随 Skill 改写，语料冻结在 tests/fixtures/zh-corpus/（取自重构前的 references/）。
        baseline = json.loads((ROOT / 'tests/zh-baseline.json').read_text())
        for name, modes in baseline.items():
            text = (ROOT / 'tests/fixtures/zh-corpus' / name).read_text()
            for mode, args in [('auto', []), ('zh', ['--lang', 'zh']),
                               ('clean', ['--lang', 'zh', '--clean'])]:
                with self.subTest(file=name, mode=mode):
                    r = run(text, *args)
                    self.assertEqual(r.returncode, modes[mode]['exit'])
                    self.assertEqual(hashlib.sha256(r.stdout.encode()).hexdigest(),
                                     modes[mode]['sha256'])


if __name__ == '__main__':
    unittest.main()
