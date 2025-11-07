import { fetchMutation, fetchQuery } from "convex/nextjs";
import { inngest } from "./client";
import { api } from "../../convex/_generated/api";
import { extractOrderLike, extractSubscriptionLike, isEntitledStatus, isPolarWebhookEvent, PolarOrder, PolarSubscription, ReceivedEvent, toMs } from "@/types/polar";
import { Id } from "../../convex/_generated/dataModel";
import { tr } from "date-fns/locale";


export const autoSaveProjectWorkflow = inngest.createFunction(
    { id: 'autosave-project-workflow', name: 'Autosave Project Workflow' },
    { event: 'project/autosave.requested' },
    async ({ event }) => {
        const { projectId, shapesData, viewportData } = event.data
        try {
            await fetchMutation(api.projects.updateProjectSketches, {
                projectId,
                sketchesData: shapesData,
                viewportData

            })

            return { success: true }
        } catch (error) {
            console.error('Error autosaving project:', error)
            throw error

        }
    }

)
const grantKey = (
    subId: string,
    periodEndMs?: number,
    eventId?: string
): string => periodEndMs != null ? `${subId}:${periodEndMs}` : eventId != null ? `${subId}:evt:${eventId}` : `${subId}:first`

export const handlePolarEvent = inngest.createFunction(
    { id: 'polar-webhook-handler', name: 'Polar Webhook Handler' },
    { event: 'polar/webhook.received' },
    async ({ event, step }) => {
        console.log('Polar webhook event received in Inngest:')
        console.log(
            '[Inngest] Raw event data',
            JSON.stringify(event.data, null, 2)
        )
        if (!isPolarWebhookEvent(event.data)) {
            return

        }
        const incoming = event.data as ReceivedEvent
        const type = incoming.type
        const dataUnknown = incoming.data
        const sub: PolarSubscription | null = extractSubscriptionLike(dataUnknown)
        const order: PolarOrder | null = extractOrderLike(dataUnknown)
        if (!sub && !order) {
            console.log('No subscription or order data found in event')
            return
        }

        const userId: Id<'users'> | null = await step.run(
            'resolve-user',
            async () => {
                const metaUserId = (sub?.metadata?.userId as string | undefined) ??
                    (order?.metadata?.userId as string | undefined)

                if (metaUserId) {
                    console.log('[Inngest] using metadata userId:', metaUserId)
                    return metaUserId as unknown as Id<'users'>
                }
                const email = sub?.customer?.email ?? order?.customer?.email ?? null
                console.log('[Inngest] looking up user by email:', email)
                if (email) {
                    try {
                        console.log('Looking up user by email:', email)
                        const foundUserId = await fetchQuery(api.user.getUserIdByEmail, { email })
                        console.log('Found userId:', foundUserId)
                        return foundUserId
                    } catch (error) {
                        console.error('Error looking up user by email:', error)
                        console.error('Error looking up user of email:', email)
                        return null

                    }
                }
                console.log('No email found to look up user')
                return null

            }
        )
        console.log('[Inngest] Resolved userId:', userId)
        if (!userId) {
            console.log('No userId resolved, skipping event processing')
            return
        }
        const polarSubscriptionId = sub?.id ?? order?.subscription_id ?? ''
        console.log('[Inngest] Polar subscription ID:', polarSubscriptionId)
        if (!polarSubscriptionId) {
            console.log('No polar subscription ID found, skipping event processing')
            return
        }

        const currentPeriodEnd = toMs(sub?.current_period_end)
        const rawPriceId = sub?.prices?.[0]?.id
        const payload =
        {
            userId,
            polarCustomerId: sub?.customer?.id ?? sub?.customer_id ?? order?.customer_id ?? '',
            polarSubscriptionId,
            productId: sub?.product_id ?? sub?.product?.id ?? undefined,
            priceId: rawPriceId != null ? String(rawPriceId) : undefined,
            planCode: sub?.plan_code ?? sub?.product?.name ?? undefined,
            status: sub?.status ?? 'updated',
            currentPeriodEnd,
            trialEndsAt: toMs(sub?.trial_ends_at),
            cancelAt: toMs(sub?.cancel_at),
            canceledAt: toMs(sub?.canceled_at),
            seats: sub?.seats ?? undefined,
            metadata: dataUnknown, // Keep as any to match Convex schema
            creditsGrantPerPeriod: 10,
            creditsRolloverLimit: 100,
        }
        console.log('[Inngest] Processed payload:', JSON.stringify(payload, null, 2))
        const subscriptionId = await step.run('upsert-subscription', async () => {
            try {
                console.log('[Inngest] Upserting subscription to Convex')
                console.log('Checking for eisting subscriptions first...')
                const existingByPolar = await fetchQuery(api.subscription.getByPolarId, {
                    polarSubscriptionId: payload.polarSubscriptionId
                })

                console.log('Existing subscription by polar ID:', existingByPolar ? 'found' : 'not found')
                const existingByUser = await fetchQuery(api.subscription.getSubscriptionForUser, {
                    userId: payload.userId
                })
                console.log('Existing subscription by user ID:', existingByUser ? 'found' : 'not found')
                if (existingByPolar && existingByUser && existingByPolar._id !== existingByUser._id) {
                    console.warn('DUPLICATE DETECTED:User has different subscription by Polar ID vs User ID')
                    console.warn('- By Pola ID:', existingByPolar._id)
                    console.warn('- By User ID:', existingByUser._id)

                }
                const result = await fetchMutation(api.subscription.upsertFromPolar, payload)
                const allUserSubs = await fetchQuery(api.subscription.getAllForUser, {
                    userId: payload.userId
                })

                if (allUserSubs && allUserSubs.length > 1) {
                    allUserSubs.forEach((sub, index) => {
                        console.error(
                            `${index + 1}: ${sub._id} | PolarID:${sub.polarSubscriptionId} | Status:${sub.status}`
                        )
                    })
                }
                return result

            } catch (error) {
                console.error('Error upserting subscription in Convex:', error)
                console.error('Payload was:', JSON.stringify(payload, null, 2))
                throw error

            }
        })
        const looksCreate = /subscription\.created/i.test(type)
        const looksRenew = /subscription\.renew|order\.created|invoice\.paid/i.test(type)
        const entitled = isEntitledStatus(payload.status)

        console.log('[Inngest] Credit granting analysis')
        console.log('Event type:', type)
        console.log('Looks like create:', looksCreate)
        console.log('Looks like renew:', looksRenew)
        console.log('Subscription status:', payload.status)
        console.log('User is entitled:', entitled)

        const idk = grantKey(
            polarSubscriptionId,
            currentPeriodEnd,
            incoming.id != null ? String(incoming.id) : undefined
        )
        console.log('Computed grant key:', idk)

        if (entitled && (looksCreate || looksRenew || true)) {
            const grant = await step.run('grant-credits', async () => {
                try {


                    console.log('[Inngest] Granting credits to user:', userId)
                    const result = await fetchMutation(api.subscription.grantCreditsIfNeeded,
                        {
                            subscriptionId,
                            idempotencyKey: idk,
                            amount: 1000,
                            reason: looksCreate ? 'initial-grant' : 'periodic-grant'
                        }
                    )
                    console.log('[Inngest] Grant result:', result)
                    return result
                } catch (error) {
                    console.error('[Inngest] Error granting credits:', error)
                    throw error
                }
            })
            console.log('[Inngest] Credit grant result', grant)
            if (grant.ok && !('skipped' in grant && grant.skipped)) {

                await step.sendEvent('credits-granted', {
                    name: 'billing/credits.granted',
                    id: `credits-granted: ${polarSubscriptionId}: ${currentPeriodEnd ?? 'first'}`,
                    data: {
                        userId,
                        amount: 'granted' in grant ? (grant.granted ?? 1000) : 1000,
                        balance: 'balance' in grant ? grant.balance : undefined,
                        periodEnd: currentPeriodEnd,
                    }
                })

                console.log('[Inngest] Emitted credits-granted event sent')

            }
            else {
                console.log('[Inngest] No credits granted, skipping event emission')
            }
        }
        else {
            console.log('[Inngest] Credit granting conditions not met')
        }


        await step.sendEvent('sub-synced', {
            name: 'billing/subscription.synced',
            id: `sub-synced: ${polarSubscriptionId}:${currentPeriodEnd ?? 'first'}`,
            data: {
                userId,
                polarSubscriptionId,
                status: payload.status,
                currentPeriodEnd,
            },

        })
        console.log('[Inngest] Emitted subscription.synced event')

        if (currentPeriodEnd && currentPeriodEnd > Date.now()) {
            const runAt = new Date(
                Math.max(Date.now() + 5000, currentPeriodEnd - 3 * 24 * 60 * 60 * 1000)
            )
            await step.sleepUntil('wait-until-expiry', runAt)
            const stillEntitled = await step.run('check-entitlement', async () => {
                try {
                    const result = await fetchQuery(api.subscription.hasEntitlement, {
                        userId
                    })
                    console.log('[Inngest] Entitlement check result:', result)
                    return result
                } catch (error) {
                    console.error('[Inngest] Error checking entitlement:', error)
                    throw error

                }
            })
            if (stillEntitled) {
                await step.sendEvent('pre-expiry', {
                    name: 'billing/subscription.pre_expiry',
                    data: {
                        userId,
                        runAt: runAt.toISOString(),
                        periodEnd: currentPeriodEnd,
                    }
                })
            }
        }


    }





)
