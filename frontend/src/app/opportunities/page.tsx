import { OpportunityHub } from '@/components/opportunities/OpportunityHub'

export default function OpportunitiesPage() {
  return (
    <div className="px-4 pt-3 pb-8 animate-fade-in">
      <OpportunityHub defaultRegion="all" />
    </div>
  )
}
