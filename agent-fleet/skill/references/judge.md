## JEV judge

`fleet judge state.txt questions.json [--json]`：state 为文本或 `.json` 文件；questions 是 `{ "key": { "type": "noul"|"choice"|"score", "instructions": "..." } }`。`choice` 和 `score` 必须带 `criteria`。JEV 只做结构化判断，不生成自由文本，也不能用 `run`。旧写法 `fleet judge --model jev --state-file state.txt --questions-file questions.json` 仍可用。

`questions.json` 可按需选用其中一种或组合使用：

```json
{
  "is_urgent": { "type": "noul", "instructions": "这条消息是否紧急？" },
  "team": { "type": "choice", "instructions": "该由哪个团队处理？", "criteria": { "billing": "付款或退款", "technical": "故障或集成" } },
  "frustration": { "type": "score", "instructions": "客户有多沮丧？", "criteria": ["平静", "沮丧", "愤怒"] }
}
```
