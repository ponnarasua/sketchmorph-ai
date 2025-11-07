import { fetchMutation, preloadQuery } from "convex/nextjs"
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server"
import { api } from "../../convex/_generated/api"
import { ConvexUserRaw, normalizeProfile } from "@/types/user"
import { Id } from "../../convex/_generated/dataModel"

export const ProfileQuery = async () => {

    return await preloadQuery(
        api.user.getCurrentUser, {},
        { token: await convexAuthNextjsToken() }
    )
}


export const SubscriptionEntitleMentQuery = async () => {
    const rawProfile = await ProfileQuery()
    const profile = normalizeProfile(rawProfile._valueJSON as unknown as ConvexUserRaw | null)
    const entitlement = await preloadQuery(
        api.subscription.hasEntitlement,
        {
            userId: profile?.id as Id<'users'>
        },
        { token: await convexAuthNextjsToken() }
    )
    return { entitlement, profileName: profile?.name }



}
export const ProjectQuery = async (projectId: string) => {

    const rawProfile = await ProfileQuery()
    const profile = normalizeProfile(rawProfile._valueJSON as unknown as ConvexUserRaw | null)
    if (!profile?.id || !projectId) {
        return { project: null, profile: null }
    }

    const project = await preloadQuery(
        api.projects.getProject,
        { projectId: projectId as Id<'projects'> },
        { token: await convexAuthNextjsToken() }
    )
    return { project, profile }
}

export const ProjectsQuery = async () => {
    const rawProfile = await ProfileQuery()
    const profile = normalizeProfile(rawProfile._valueJSON as unknown as ConvexUserRaw | null)
    if (!profile) return { prpjects: null, profile: null }

    const projects = await preloadQuery(
        api.projects.getUserProjects,
        { userId: profile.id as Id<'users'> }
        ,
        { token: await convexAuthNextjsToken() }
    )
    return { projects, profile }
}

export const StyleGuideQuery = async (projectId: string) => {
    const styleGuide = await preloadQuery(
        api.projects.getProjectStyleGuide,
        { projectId: projectId as Id<'projects'> },
        { token: await convexAuthNextjsToken() }
    )
    return { styleGuide }
}

export const MoodBoardImagesQuery = async (projectId: string) => {
    const images = await preloadQuery(
        api.moodboard.getMoodBoardImages,
        { projectId: projectId as Id<'projects'> },
        { token: await convexAuthNextjsToken() })

    return { images }


}

export const CreditsBalanceQuery = async () => {
    const rawProfile = await ProfileQuery()
    const profile = normalizeProfile(rawProfile._valueJSON as unknown as ConvexUserRaw | null)
    if (!profile?.id) {
        return { ok: false, balance: 0, profile: null }
    }

    const balance = await preloadQuery(
        api.subscription.getCreditsBalance,
        { userId: profile.id as Id<'users'> },
        { token: await convexAuthNextjsToken() }
    )
    const actualBalance = balance._valueJSON as unknown as number

    // For development: if user has no subscription (balance = 0), give them 10 free credits
    const effectiveBalance = actualBalance === 0 ? 10 : actualBalance

    return { ok: true, balance: effectiveBalance, profile }
}

export const ConsumedCreditsQuery = async ({ amount }: { amount?: number }) => {
    const rawProfile = await ProfileQuery()
    const profile = normalizeProfile(rawProfile._valueJSON as unknown as ConvexUserRaw | null)

    if (!profile?.id) {
        return { ok: false, balance: 0, profile: null }
    }

    // Check if user has an actual subscription
    const balanceCheck = await preloadQuery(
        api.subscription.getCreditsBalance,
        { userId: profile.id as Id<'users'> },
        { token: await convexAuthNextjsToken() }
    )
    const actualBalance = balanceCheck._valueJSON as unknown as number

    // If user has a real subscription, consume from it
    if (actualBalance > 0) {
        const credits = await fetchMutation(
            api.subscription.consumeCredits,
            {
                reason: 'ai:generation',
                userId: profile.id as Id<'users'>,
                amount: amount || 1
            },
            { token: await convexAuthNextjsToken() }
        )
        return { ok: credits.ok, balance: credits.balance, profile }
    } else {
        // For development: allow consumption even without subscription (virtual credits)
        // In production, this would require a subscription
        return { ok: true, balance: 9, profile } // Return 9 credits remaining (10 - 1)
    }
}


export const InspirationImagesQuery = async (projectId: string) => {
    const images = await preloadQuery(
        api.inspiration.getInspirationImages,
        { projectId: projectId as Id<'projects'> },
        { token: await convexAuthNextjsToken() })

    return { images }

}
