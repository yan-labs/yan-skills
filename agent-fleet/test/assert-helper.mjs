// 测试用的极简断言/汇总工具,被 test/ 下的各个测试脚本共用。
// 不引入测试框架:这个包只有一个运行时依赖(Claude Agent SDK),测试也保持零额外依赖,
// 任何人 clone 下来 `npm install` 之后就能直接跑。

/**
 * 创建一个断言收集器。
 * 逐条打印 PASS/FAIL 而不是第一条失败就抛出,是为了一次运行能看到全部失败点——
 * 安全回归测试尤其需要"哪几层防护同时塌了"这个整体视图。
 */
export function createAsserter(title) {
  const failures = [];

  const assert = (cond, message) => {
    if (!cond) failures.push(message);
    console.log(`${cond ? 'PASS' : 'FAIL'} - ${message}`);
    return Boolean(cond);
  };

  /** 断言某段可执行代码抛出了指定类型/关键词的错误。用于 fail-closed 路径。 */
  const assertThrows = (fn, expectedText, message) => {
    let thrown = null;
    try {
      fn();
    } catch (err) {
      thrown = err;
    }
    const ok = thrown != null && String(thrown.message).includes(expectedText);
    return assert(ok, `${message}(实际: ${thrown ? thrown.message.split('\n')[0] : '没有抛错'})`);
  };

  /** 打印汇总并以合适的退出码结束进程。 */
  const finish = () => {
    console.log(`\n${'='.repeat(60)}`);
    if (failures.length === 0) {
      console.log(`${title}:全部通过。`);
      process.exit(0);
    }
    console.log(`${title}:有 ${failures.length} 项失败:`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  };

  return { assert, assertThrows, finish, failures };
}
