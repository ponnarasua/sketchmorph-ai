import { autoSaveProjectWorkflow, handlePolarEvent } from "@/inngest/functions"
import { serve } from "inngest/next"
import { inngest } from "./client"

export const { GET, POST, PUT } = serve({
    client: inngest,
    functions: [autoSaveProjectWorkflow, handlePolarEvent],
    logLevel: 'info',
})