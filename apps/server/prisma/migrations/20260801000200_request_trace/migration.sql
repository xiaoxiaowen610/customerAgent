ALTER TABLE "AiRun" ADD COLUMN "requestId" TEXT;
ALTER TABLE "ToolCallRecord" ADD COLUMN "requestId" TEXT;

CREATE INDEX "AiRun_requestId_idx" ON "AiRun"("requestId");
CREATE INDEX "ToolCallRecord_requestId_idx" ON "ToolCallRecord"("requestId");
