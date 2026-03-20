import type {
  ParseSourceDocumentInput,
  ParseSourceDocumentOutput,
} from "../tasks/parse-source-document";
import type { StageContext } from "./context";
import { runParsePipeline } from "./pipeline";
import { toParseSourceDocumentOutput } from "./result-mapper";

export async function executeParseSourceDocument(
  input: ParseSourceDocumentInput,
  ctx: StageContext
): Promise<ParseSourceDocumentOutput> {
  const pipelineResult = await runParsePipeline(input, ctx);
  return toParseSourceDocumentOutput(pipelineResult);
}
