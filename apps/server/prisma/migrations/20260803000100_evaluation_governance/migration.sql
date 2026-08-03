-- CreateEnum
CREATE TYPE "PromptVersionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "ReviewTaskStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED');
CREATE TYPE "ReviewPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "EvaluationRunMode" AS ENUM ('DETERMINISTIC', 'LLM');

-- CreateTable
CREATE TABLE "PromptVersion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "status" "PromptVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PromptVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EvaluationCase" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "expectedIntent" TEXT NOT NULL,
    "expectedTool" TEXT,
    "expectedAction" TEXT NOT NULL,
    "tags" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EvaluationCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentEvaluation" (
    "id" TEXT NOT NULL,
    "aiRunId" TEXT NOT NULL,
    "promptVersionId" TEXT,
    "correctnessScore" INTEGER NOT NULL,
    "toolUsageScore" INTEGER NOT NULL,
    "latencyScore" INTEGER NOT NULL,
    "safetyScore" INTEGER NOT NULL,
    "totalScore" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "reason" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentEvaluation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentReviewTask" (
    "id" TEXT NOT NULL,
    "aiRunId" TEXT NOT NULL,
    "evaluationId" TEXT,
    "reason" TEXT NOT NULL,
    "priority" "ReviewPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "ReviewTaskStatus" NOT NULL DEFAULT 'PENDING',
    "assigneeId" TEXT,
    "reviewerId" TEXT,
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    CONSTRAINT "AgentReviewTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EvaluationCaseRun" (
    "id" TEXT NOT NULL,
    "evaluationCaseId" TEXT NOT NULL,
    "promptVersionId" TEXT,
    "mode" "EvaluationRunMode" NOT NULL DEFAULT 'DETERMINISTIC',
    "actualIntent" TEXT NOT NULL,
    "actualTool" TEXT,
    "correctnessScore" INTEGER NOT NULL,
    "toolUsageScore" INTEGER NOT NULL,
    "totalScore" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvaluationCaseRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PromptVersion_name_version_key" ON "PromptVersion"("name", "version");
CREATE INDEX "PromptVersion_name_status_idx" ON "PromptVersion"("name", "status");
CREATE UNIQUE INDEX "EvaluationCase_name_key" ON "EvaluationCase"("name");
CREATE INDEX "EvaluationCase_enabled_createdAt_idx" ON "EvaluationCase"("enabled", "createdAt");
CREATE UNIQUE INDEX "AgentEvaluation_aiRunId_key" ON "AgentEvaluation"("aiRunId");
CREATE INDEX "AgentEvaluation_passed_createdAt_idx" ON "AgentEvaluation"("passed", "createdAt");
CREATE INDEX "AgentEvaluation_totalScore_createdAt_idx" ON "AgentEvaluation"("totalScore", "createdAt");
CREATE UNIQUE INDEX "AgentReviewTask_aiRunId_key" ON "AgentReviewTask"("aiRunId");
CREATE UNIQUE INDEX "AgentReviewTask_evaluationId_key" ON "AgentReviewTask"("evaluationId");
CREATE INDEX "AgentReviewTask_status_priority_createdAt_idx" ON "AgentReviewTask"("status", "priority", "createdAt");
CREATE INDEX "AgentReviewTask_assigneeId_status_idx" ON "AgentReviewTask"("assigneeId", "status");
CREATE INDEX "EvaluationCaseRun_evaluationCaseId_createdAt_idx" ON "EvaluationCaseRun"("evaluationCaseId", "createdAt");
CREATE INDEX "EvaluationCaseRun_passed_createdAt_idx" ON "EvaluationCaseRun"("passed", "createdAt");

-- AddForeignKey
ALTER TABLE "AgentEvaluation" ADD CONSTRAINT "AgentEvaluation_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "AiRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentEvaluation" ADD CONSTRAINT "AgentEvaluation_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "PromptVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentReviewTask" ADD CONSTRAINT "AgentReviewTask_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "AiRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentReviewTask" ADD CONSTRAINT "AgentReviewTask_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "AgentEvaluation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentReviewTask" ADD CONSTRAINT "AgentReviewTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentReviewTask" ADD CONSTRAINT "AgentReviewTask_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EvaluationCaseRun" ADD CONSTRAINT "EvaluationCaseRun_evaluationCaseId_fkey" FOREIGN KEY ("evaluationCaseId") REFERENCES "EvaluationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvaluationCaseRun" ADD CONSTRAINT "EvaluationCaseRun_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "PromptVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
