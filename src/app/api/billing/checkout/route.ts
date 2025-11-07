import { NextRequest, NextResponse } from "next/server";
import { Polar } from "@polar-sh/sdk";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const userId = searchParams.get("userId");

        if (!userId) {
            return NextResponse.json({ error: "userId is required" }, { status: 400 });
        }

        // Check for required environment variables
        if (!process.env.POLAR_ACCESS_TOKEN) {
            console.error("POLAR_ACCESS_TOKEN is not set");
            return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
        }

        if (!process.env.POLAR_STANDARD_PLAN) {
            console.error("POLAR_STANDARD_PLAN is not set");
            return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
        }

        if (!process.env.NEXT_PUBLIC_APP_URL) {
            console.error("NEXT_PUBLIC_APP_URL is not set");
            return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
        }

        const polar = new Polar({
            server: process.env.POLAR_ENV === "sandbox" ? "sandbox" : "production",
            accessToken: process.env.POLAR_ACCESS_TOKEN!,
        });

        console.log('Creating checkout with:', {
            products: [process.env.POLAR_STANDARD_PLAN!],
            successUrl: `${process.env.NEXT_PUBLIC_APP_URL}/billing/success`,
            userId
        });

        const session = await polar.checkouts.create({
            products: [process.env.POLAR_STANDARD_PLAN!], // Reverted to 'products'
            successUrl: `${process.env.NEXT_PUBLIC_APP_URL}/billing/success`,
            metadata: {
                userId,
            }
        });

        return NextResponse.json({ url: session.url });
    } catch (error) {
        console.error("Checkout creation error:", error);

        // Log more details about the error
        if (error instanceof Error) {
            console.error("Error message:", error.message);
            console.error("Error stack:", error.stack);
        }

        return NextResponse.json(
            { error: "Failed to create checkout session" },
            { status: 500 }
        );
    }
}