export type IncomeType = 'commission' | 'manual'
export type CommissionValueType = 'percentage' | 'fixed' | 'tiered-per-item'

export type CommissionTier = {
  minItems: number
  amountPerItem: number
}

export type UserProfile = {
  id: string
  displayName: string
  defaultHourlyIncome: number
  currency: string
  payUploadFrequency?: 'biweekly' | 'monthly'
  lastPayUploadDate?: string | null
}

export type CommissionCategory = {
  id: string
  name: string
  valueType: CommissionValueType
  defaultRate: number
  tiers: CommissionTier[]
  color: string
  description: string
  active: boolean
}

export type CommissionTemplate = {
  id: string
  name: string
  commissionCategoryId: string
  defaultHours: number
  expectedUnitsSold: number
  expectedSalesAmount: number
  dayOfMonth: number
  notes: string
  active: boolean
}

export type RoutineEntry = {
  id: string
  date: string
  title: string
  startTime: string
  endTime: string
  notes: string
  completed: boolean
}

export type IncomeEntry = {
  id: string
  date: string
  type: IncomeType
  generatedFromTemplateId: string | null
  generatedForMonth: string | null
  commissionCategoryId: string
  commissionValueTypeOverride: CommissionValueType | null
  commissionRateOverride: number | null
  hourlyRateOverride: number | null
  hours: number
  unitsSold: number
  salesAmount: number
  manualAmount: number
  notes: string
}

export type PayUploadEntry = {
  id: string
  startDate: string
  endDate: string
  paymentDate: string
  estimatedIncome: number
  actualIncome: number
  variance: number
  notes: string
}

export type BudgetEntry = {
  id: string
  category: string
  monthlyLimit: number
  color: string
}

export type BudgetFlowDirection = 'payment' | 'collection'
export type BudgetCommitmentType =
  | 'loan'
  | 'rent'
  | 'mortgage'
  | 'receivable'
  | 'utility'
  | 'subscription'
  | 'insurance'
  | 'other'

export type BudgetCommitmentEntry = {
  id: string
  name: string
  type: BudgetCommitmentType
  linkedCreditCardId: string | null
  direction: BudgetFlowDirection
  group: string
  currentAmount: number
  recurringMonthly: boolean
  dueDay: number | null
  active: boolean
  color: string
  notes: string
}

export type BudgetCommitmentLogEntry = {
  id: string
  commitmentId: string
  date: string
  amount: number
  status: 'planned' | 'completed'
  notes: string
}

export type CreditCardEntry = {
  id: string
  name: string
  issuer: string
  creditLimit: number
  currentUsage: number
  apr: number
  minimumPayment: number
  dueDay: number | null
  interestChargeDay: number | null
  active: boolean
  notes: string
}

export type ExpenseEntry = {
  id: string
  date: string
  categoryId: string
  amount: number
  description: string
  notes: string
  paymentSource?: 'cash' | 'credit-card'
  creditCardId?: string | null
  creditCardInterestAmount?: number
  creditCardChargeTotal?: number
}
