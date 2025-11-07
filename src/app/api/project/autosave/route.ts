import { inngest } from '@/inngest/client'
import { NextRequest, NextResponse } from 'next/server'

interface AutosaveProjectRequest {
    projectId: string
    userId: string
    shapesData: {
        shapes: Record<string, unknown>
        tool: string
        selected: Record<string, unknown>
        frameCounter: number
    }
    viewportData?: {
        scale: number
        translate: { x: number; y: number }
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const body: AutosaveProjectRequest = await request.json()
        const { projectId, shapesData, viewportData, userId } = body

        if (!projectId || !userId || !shapesData) {
            return NextResponse.json(
                { error: 'Project ID, User ID, or Shapes Data is missing' },
                { status: 400 }
            )
        }

        // Send to Inngest for background processing
        const eventResult = await inngest.send({
            name: 'project/autosave.requested',
            data: { projectId, shapesData, viewportData, userId }
        })

        return NextResponse.json({
            success: true,
            message: 'Project autosave initiated',
            eventId: eventResult.ids[0],
            projectId
        })

    } catch (error) {
        console.error('Autosave error:', error)
        return NextResponse.json({
            error: 'Failed to autosave project',
            message: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 })
    }
}

// Handle other methods with 405 Method Not Allowed
export async function GET() {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}

export async function POST() {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}

export async function DELETE() {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}