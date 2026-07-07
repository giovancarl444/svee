# CORTEX local-model triage benchmark

26 ground-truth-labeled synthetic items, scored against the operator's expected category/urgency. Same redaction payload + triage schema + system prompt for every model. Cost pulled from CORTEX's own pricing table (local = \$0).

| model | items | category acc | urgency ±1 | valid JSON | failures | avg latency | tokens | cost |
|---|---|---|---|---|---|---|---|---|
| `qwen2.5:7b-instruct` | 26 | 62% | 92% | 96% | 1 | 3639 ms | 15874 | $0.000000 |
| `gemma3:4b` | 26 | 58% | 88% | 92% | 2 | 3558 ms | 13938 | $0.000000 |
| `qwen3:4b` | 6 | 0% | — | 0% | 6 | 30645 ms | 0 | $0.000000 |

- **category acc** = predicted category == the label, over all attempted items (a failed/invalid output counts as wrong).
- **urgency ±1** = predicted urgency within 1 of the label, over valid outputs.
- **valid JSON** = share of calls that returned an in-vocabulary category (a reasoning model that "thinks" past the token budget returns none).
