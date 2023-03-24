# dicexp.js

## Usage

```typescript
import { evaluate } from "dicexp";

const result = evaluate("sort(10#d100) |> head");
if (result.value) {
  console.log(result.value);
} else {
  console.log("error!");
}
```
