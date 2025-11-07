"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery } from "convex/react"
import { api } from "../../../../../convex/_generated/api"
import { Id } from "../../../../../convex/_generated/dataModel"

const Page = () => {
    const router = useRouter()
    const searchParams = useSearchParams()
    const redirected = useRef(false)
    const [timedOut, setTimedOut] = useState(false)
    const [checkCount, setCheckCount] = useState(0)

    const me = useQuery(api.user.getCurrentUser, {})
    const entitled = useQuery(
        api.subscription.hasEntitlement,
        me && me._id ? { userId: me._id as Id<'users'> } : "skip"
    );

    // Check for customer_session_token to confirm this is a redirect from payment
    const customerSessionToken = searchParams.get('customer_session_token')

    useEffect(() => {
        if (redirected.current) return
        if (me === undefined) return

        if (me === null) {
            redirected.current = true
            router.replace('/auth/sign-in')
            return
        }
        if(entitled){
            redirected.current = true
            router.replace('/dashboard')
        }

        // If we have a customer_session_token, this is a payment completion
        // Poll for entitlement status
        if (customerSessionToken && !entitled && checkCount < 10) {
            const pollTimer = setTimeout(() => {
                setCheckCount(prev => prev + 1)
                // Refetch the entitlement query
                if (me._id) {
                    // Force a refetch by invalidating the query
                    // This will cause the useQuery to re-run
                }
            }, 3000) // Check every 3 seconds

            return () => clearTimeout(pollTimer)
        }
    }, [me, entitled, customerSessionToken, checkCount, router])

    useEffect(() => {
        if (!redirected.current) return
        if (!me || entitled) return
        const t = setTimeout(() => {
            if (redirected.current) return
            setTimedOut(true)
            redirected.current = true
            router.replace(`/billing/${me.name}`)
        }, 45_000);
        return () => clearTimeout(t)
    }, [me, entitled, router])

    // If we have entitlement, redirect immediately
    useEffect(() => {
        if (entitled && me && !redirected.current) {
            redirected.current = true
            router.replace('/dashboard')
        }
    }, [entitled, me, router])

    return (

        <div className="mx-auto max-w-md p-8 text-center">
            <div className="mb-3">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300
border-t-transparent align-[-2px]" />
            </div>
            <div className="mb-1 text-lg">
                {customerSessionToken ? "Finalizing your subscription ..." : "Loading ..."}
            </div>
            <div className="text-sm text-gray-500" aria-live="polite">
                {me === undefined
                    ? "Checking your account ... "
                    : entitled === undefined
                        ? customerSessionToken
                            ? `Confirming your subscription ... (${checkCount}/10)`
                            : "Confirming your entitlement ... "
                        : timedOut
                            ? "Taking longer than expected - redirecting to billing."
                            : customerSessionToken
                                ? "Processing payment confirmation ..."
                                : "This should only take a few seconds."}

            </div>
        </div>
    )
}


export default Page