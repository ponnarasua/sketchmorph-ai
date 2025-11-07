import { SubscriptionEntitleMentQuery } from '@/convex/query.config'
import { combinedSlug } from '@/lib/utils'
import { redirect } from 'next/navigation'

const Page = async () => {
    const {entitlement,profileName}=await SubscriptionEntitleMentQuery() 
    if(!entitlement._valueJSON){
        redirect(`/billing/${combinedSlug(profileName!)}`)
    } else {
        redirect(`/dashboard/${combinedSlug(profileName!)}`)
    }
}


export default Page