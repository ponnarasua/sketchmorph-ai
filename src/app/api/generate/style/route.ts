import { ConsumedCreditsQuery, CreditsBalanceQuery, MoodBoardImagesQuery } from "@/convex/query.config";
import { MoodBoardImage } from "@/hooks/use-styles";
import { prompts } from "@/prompts";
import { NextRequest, NextResponse } from "next/server";
import { generateObject } from 'ai'
import { google } from '@ai-sdk/google'
import z from "zod";
import { fetchMutation } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";

const ColorSwatchSchema = z.object({
    name: z.string(),
    hexColor: z.string().regex(/^#([0-9A-Fa-f]{6})$/, 'Must be valid hex color'),
    description: z.string().optional()
})

const ColorSectionSchema = z.object({
    title: z.string(),
    swatches: z.array(ColorSwatchSchema)
})

const PrimaryColorsSchema = z.object({
    title:z.literal("Primary Colors"),
    swatches: z.array(ColorSwatchSchema).length(4),
})

const SecondaryColorsSchema = z.object({
title: z. literal('Secondary & Accent Colors'),
swatches: z.array(ColorSwatchSchema).length(4),
})

const UIComponentColorsSchema = z.object({
    title: z.literal('UI Component Colors'),
swatches: z.array(ColorSwatchSchema).length(6),
})

const UtilityColorsSchema = z.object({
    title: z.literal('Utility & Form Colors'),
swatches: z.array(ColorSwatchSchema).length(3),
})

const StatusColorsSchema = z.object({
    title: z.literal('Status & Feedback Colors'),
    swatches: z.array(ColorSwatchSchema).length(2),
})
const TypographyStyleSchema = z.object({
name: z.string(),
fontFamily: z.string(),
fontSize: z.string(),
fontWeight: z.string(),
lineHeight: z.string(),
letterSpacing: z.string().optional(),
description: z.string().optional(),
})
const TypographySectionSchema = z.object({
    title: z.string(),
    styles:z.array(TypographyStyleSchema)
})

const StyleGuideSchema = z.object({
    theme: z.string(),
    description: z.string(),
    primaryColors: z.array(ColorSwatchSchema).length(4),
    secondaryColors: z.array(ColorSwatchSchema).length(4),
    uiComponentColors: z.array(ColorSwatchSchema).length(6),
    utilityColors: z.array(ColorSwatchSchema).length(3),
    statusColors: z.array(ColorSwatchSchema).length(2),
    typographySections: z.array(TypographySectionSchema).length(3),
})


export async function POST(request: NextRequest) {
    console.log('🎨 Style guide API called - FULL VERSION')
    try {
        let body;
        try {
            body = await request.json()
            console.log('Style guide API received body:', body)
        } catch (error) {
            console.log('Error parsing request body:', error)
            return NextResponse.json(
                { error: 'Invalid request body' },
                { status: 400 }
            )
        }
        const { projectId } = body
        console.log('Extracted projectId:', projectId)
        if (!projectId) {
            console.log('ProjectId is missing')
            return NextResponse.json(
                { error: 'Project ID is required' },
                { status: 400 }
            )
        }

        // Check if we can get auth token
        let authToken;
        try {
            authToken = await convexAuthNextjsToken()
            console.log('Auth token available:', !!authToken)
        } catch (error) {
            console.log('Error getting auth token:', error)
            return NextResponse.json(
                { error: 'Authentication failed' },
                { status: 401 }
            )
        }

        console.log('Starting credits balance check...')
        let balanceOk, balanceBalance;
        try {
            const creditsResult = await CreditsBalanceQuery()
            balanceOk = creditsResult.ok
            balanceBalance = creditsResult.balance
            console.log('Credits balance check result:', { ok: balanceOk, balance: balanceBalance })
        } catch (error) {
            console.log('Error fetching credits balance:', error)
            return NextResponse.json(
                { error: 'Failed to fetch credits balance' },
                { status: 500 }
            )
        }
        if (!balanceOk) {
            console.log('Credits balance query failed - not ok')
            return NextResponse.json(
                { error: 'Failed to fetch credits balance' },
                { status: 500 }
            )

        }
        if (balanceBalance === 0) {
            console.log('No credits available - balance is 0')
            return NextResponse.json(
                { error: 'Insufficient credits' },
                { status: 400 }
            )
        }
        console.log('Credits check passed, fetching mood board images...')

        let moodBoardImages;
        try {
            moodBoardImages = await MoodBoardImagesQuery(projectId)
            console.log('Mood board images result:', moodBoardImages)
        } catch (error) {
            console.log('Error fetching mood board images:', error)
            return NextResponse.json(
                { error: 'Failed to fetch mood board images' },
                { status: 500 }
            )
        }
        if (!moodBoardImages || !moodBoardImages.images || !moodBoardImages.images._valueJSON) {
            console.log('No mood board images found')
            return NextResponse.json(
                { error: 'No images found in mood board' },
                { status: 400 }
            )
        }

        const images = moodBoardImages.images._valueJSON as unknown as MoodBoardImage[]
        console.log('Found images:', images.length)

        if (images.length === 0) {
            console.log('Images array is empty')
            return NextResponse.json(
                { error: 'No images found in mood board' },
                { status: 400 }
            )
        }

        const imageurls = images.map(img => img.url).filter(Boolean)
        console.log('Valid image URLs:', imageurls.length)

        if (imageurls.length === 0) {
            console.log('No valid image URLs found')
            return NextResponse.json(
                { error: 'No valid images found in mood board' },
                { status: 400 }
            )
        }

        console.log('Starting AI generation...')
        const systemPrompt = prompts.styleGuide.system
        const userPrompt = `Analyze these ${imageurls.length} mood board images and generate a design system:
Extract colors that work harmoniously together and create typography that matches the aesthetic.
Return ONLY the JSON object with primaryColors (4 colors), secondaryColors (4 colors), uiComponentColors (6 colors), utilityColors (3 colors), statusColors (2 colors), and typographySections (3 sections).`

        const result = await generateObject({
            model: google('models/gemini-2.5-flash'),
            schema: StyleGuideSchema,
            system: systemPrompt,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: userPrompt,
                        },
                        ...imageurls.map((url) => ({
                            type: 'image' as const,
                            image: url as string,
                        }))
                    ],
                },
            ],
        })

        console.log('AI generation completed, consuming credits...')
        const {ok, balance} = await ConsumedCreditsQuery({amount: 1})
        if (!ok) {
            console.log('Failed to consume credits')
            return NextResponse.json(
                { error: 'Failed to consume credits' },
                { status: 500 }
            )
        }

        // Transform the result to match expected frontend format
        const styleGuideData = {
            theme: result.object.theme,
            description: result.object.description,
            colorSections: [
                {
                    title: "Primary Colors",
                    swatches: result.object.primaryColors
                },
                {
                    title: "Secondary & Accent Colors",
                    swatches: result.object.secondaryColors
                },
                {
                    title: "UI Component Colors",
                    swatches: result.object.uiComponentColors
                },
                {
                    title: "Utility & Form Colors",
                    swatches: result.object.utilityColors
                },
                {
                    title: "Status & Feedback Colors",
                    swatches: result.object.statusColors
                }
            ],
            typographySections: result.object.typographySections
        }

        console.log('Saving style guide to database...')
        await fetchMutation(
            api.projects.updateProjectStyleGuide,
            {
                projectId: projectId as Id<'projects'>,
                styleGuideData: styleGuideData
            },
            { token: authToken }
        )

        console.log('Style guide generation completed successfully')
        return NextResponse.json({
            styleGuide: styleGuideData,
            success: true,
            message: 'Style guide generated successfully',
            balance
        })
    } catch (error) {
        console.log('Error generating style guide:', error)
        return NextResponse.json({
            error: 'Error generating style guide',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 })
    }
}