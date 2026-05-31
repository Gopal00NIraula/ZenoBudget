import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
} from 'firebase/firestore'
import type { User as FirebaseUser } from 'firebase/auth'
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
} from 'date-fns'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Coins,
  Database,
  HandCoins,
  LogOut,
  Pencil,
  PiggyBank,
  Plus,
  Receipt,
  Settings,
  Trash2,
  UserRound,
  Wallet,
} from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  db,
  refreshCurrentUser,
  sendCurrentUserVerificationEmail,
  sendResetPasswordEmail,
  isFirebaseConfigured,
  signInWithEmail,
  signOutCurrentUser,
  signUpWithEmail,
  subscribeToAuth,
} from './lib/firebase'
import type {
  BudgetEntry,
  BudgetCommitmentEntry,
  BudgetCommitmentType,
  BudgetFlowDirection,
  CreditCardEntry,
  CommissionCategory,
  CommissionTemplate,
  CommissionTier,
  CommissionValueType,
  ExpenseEntry,
  IncomeEntry,
  PayUploadEntry,
  RoutineEntry,
  UserProfile,
} from './types'

type EditableRecord = {
  id: string
}

type Tab = 'overview' | 'routine' | 'datahub' | 'income' | 'budgeting' | 'settings'
type AuthMode = 'login' | 'signup'
type PayUploadFrequency = 'biweekly' | 'monthly'
type IncomeScreen = 'ledger' | 'reconciliation'
type LedgerGroupBy = 'day' | 'week' | 'biweekly' | 'month' | 'year'
type LedgerTypeFilter = 'all' | 'commission' | 'manual'

const tabToPath: Record<Tab, string> = {
  overview: '/overview',
  routine: '/routine',
  datahub: '/datahub',
  income: '/income',
  budgeting: '/budgeting',
  settings: '/settings',
}

function resolveTabFromPath(pathname: string): Tab | null {
  const normalizedPath = pathname.trim().toLowerCase().replace(/\/+$/, '') || '/'

  if (normalizedPath === '/' || normalizedPath === '/overview') {
    return 'overview'
  }

  if (normalizedPath === '/routine' || normalizedPath.startsWith('/routin')) {
    return 'routine'
  }

  if (normalizedPath === '/datahub') {
    return 'datahub'
  }

  if (normalizedPath === '/income') {
    return 'income'
  }

  if (normalizedPath === '/budgeting') {
    return 'budgeting'
  }

  if (normalizedPath === '/settings') {
    return 'settings'
  }

  return null
}

function isLoginPath(pathname: string): boolean {
  const normalizedPath = pathname.trim().toLowerCase().replace(/\/+$/, '') || '/'
  return normalizedPath === '/login'
}

type HubDayMode = 'working' | 'off'

type HubCommissionRow = {
  id: string
  commissionCategoryId: string
  unitsSold: number
  salesAmount: number
  notes: string
}

function makeHubCommissionRow(): HubCommissionRow {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    commissionCategoryId: '',
    unitsSold: 0,
    salesAmount: 0,
    notes: '',
  }
}

const todayIso = format(new Date(), 'yyyy-MM-dd')

const budgetCategoryPresets = [
  'Rent',
  'Mortgage',
  'Property Tax',
  'Home Insurance',
  'HOA Fees',
  'Home Maintenance',
  'Electricity',
  'Water',
  'Gas',
  'Internet',
  'Phone',
  'Trash',
  'Groceries',
  'Dining',
  'Coffee',
  'Fuel',
  'Public Transit',
  'Ride Share',
  'Parking',
  'Tolls',
  'Car Payment',
  'Car Insurance',
  'Vehicle Maintenance',
  'Health Insurance',
  'Medical',
  'Pharmacy',
  'Dental',
  'Vision',
  'Gym',
  'Life Insurance',
  'Disability Insurance',
  'Pet Care',
  'Pet Insurance',
  'Credit Card Payment',
  'Loan Payment',
  'Student Loan',
  'Emergency Fund',
  'Savings',
  'Retirement',
  'Investments',
  'Childcare',
  'Education',
  'School Supplies',
  'Subscriptions',
  'Streaming',
  'Software / SaaS',
  'Entertainment',
  'Hobbies',
  'Travel',
  'Shopping',
  'Clothing',
  'Personal Care',
  'Beauty',
  'Gifts',
  'Donations',
  'Charity',
  'Taxes',
  'Professional Development',
  'Business Expenses',
  'Household Supplies',
  'Furniture',
  'Appliances',
  'Miscellaneous',
] as const

const emptyRoutine = (): Omit<RoutineEntry, 'id'> => ({
  date: todayIso,
  title: '',
  startTime: '09:00',
  endTime: '10:00',
  notes: '',
  completed: false,
})

const emptyIncome = (): Omit<IncomeEntry, 'id'> => ({
  date: todayIso,
  type: 'commission',
  generatedFromTemplateId: null,
  generatedForMonth: null,
  commissionCategoryId: '',
  commissionValueTypeOverride: null,
  commissionRateOverride: null,
  hourlyRateOverride: null,
  hours: 8,
  unitsSold: 0,
  salesAmount: 0,
  manualAmount: 0,
  notes: '',
})

const emptyBudget = (): Omit<BudgetEntry, 'id'> => ({
  category: '',
  monthlyLimit: 0,
  color: '#f97316',
})

const emptyExpense = (): Omit<ExpenseEntry, 'id'> => ({
  date: todayIso,
  categoryId: '',
  amount: 0,
  description: '',
  notes: '',
  paymentSource: 'cash',
  creditCardId: null,
  creditCardInterestAmount: 0,
  creditCardChargeTotal: 0,
})

const emptyBudgetCommitment = (): Omit<BudgetCommitmentEntry, 'id'> => ({
  name: '',
  type: 'loan',
  linkedCreditCardId: null,
  direction: 'payment',
  group: 'Core Bills',
  currentAmount: 0,
  recurringMonthly: false,
  dueDay: null,
  active: true,
  color: '#0f766e',
  notes: '',
})

const emptyCreditCard = (): Omit<CreditCardEntry, 'id'> => ({
  name: '',
  issuer: '',
  creditLimit: 0,
  currentUsage: 0,
  apr: 0,
  minimumPayment: 0,
  dueDay: null,
  interestChargeDay: null,
  active: true,
  notes: '',
})

const emptyCommissionCategory = (): Omit<CommissionCategory, 'id'> => ({
  name: '',
  valueType: 'percentage',
  defaultRate: 10,
  tiers: [
    { minItems: 0, amountPerItem: 5 },
    { minItems: 5, amountPerItem: 10 },
  ],
  color: '#0f766e',
  description: '',
  active: true,
})

const emptyCommissionTemplate = (): Omit<CommissionTemplate, 'id'> => ({
  name: '',
  commissionCategoryId: '',
  defaultHours: 8,
  expectedUnitsSold: 0,
  expectedSalesAmount: 0,
  dayOfMonth: 1,
  notes: '',
  active: true,
})

function monthKeyFromIso(dateIso: string): string {
  return dateIso.slice(0, 7)
}

function shiftIsoDate(dateIso: string, offsetDays: number): string {
  return format(addDays(parseISO(dateIso), offsetDays), 'yyyy-MM-dd')
}

function startOfBiweeklyPeriod(date: Date): Date {
  const yearStart = startOfYear(date)
  const dayOffset = Math.max(0, differenceInCalendarDays(date, yearStart))
  const periodIndex = Math.floor(dayOffset / 14)
  return addDays(yearStart, periodIndex * 14)
}

function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value)
}

function parseNumberInput(value: string): number {
  if (value.trim() === '') {
    return Number.NaN
  }

  return Number(value)
}

function inputNumberValue(value: number | null | undefined): number | '' {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return ''
  }

  return value
}

function safeNumber(value: number | null | undefined, fallback = 0): number {
  return Number.isFinite(value) ? Number(value) : fallback
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function calculateProratedAprInterest(principal: number, aprPercent: number, expenseDateIso: string): number {
  const normalizedPrincipal = safeNumber(principal)
  const normalizedApr = safeNumber(aprPercent)

  if (normalizedPrincipal <= 0 || normalizedApr <= 0) {
    return 0
  }

  const chargeDate = parseISO(expenseDateIso)
  const monthEnd = endOfMonth(chargeDate)
  const daysInMonth = Number(format(monthEnd, 'd'))
  const currentDay = Number(format(chargeDate, 'd'))
  const remainingDays = Math.max(1, daysInMonth - currentDay + 1)
  const monthlyRate = normalizedApr / 100 / 12

  return roundCurrency(normalizedPrincipal * monthlyRate * (remainingDays / daysInMonth))
}

function normalizeHexColor(value: string | null | undefined, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback
  }

  const trimmed = value.trim()
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : fallback
}

function getEffectiveHourlyIncome(entry: IncomeEntry, profile: UserProfile | null): number {
  if (entry.type === 'manual') {
    return 0
  }

  return safeNumber(entry.hourlyRateOverride ?? profile?.defaultHourlyIncome ?? 0)
}

function getEffectiveCommissionRate(entry: IncomeEntry, categories: CommissionCategory[]): number {
  if (entry.type === 'manual') {
    return 0
  }

  if (entry.commissionRateOverride !== null) {
    return safeNumber(entry.commissionRateOverride)
  }

  return safeNumber(
    categories.find((category) => category.id === entry.commissionCategoryId)?.defaultRate ?? 0,
  )
}

function getCommissionCategory(
  entry: IncomeEntry,
  categories: CommissionCategory[],
): CommissionCategory | undefined {
  return categories.find((category) => category.id === entry.commissionCategoryId)
}

function getApplicableTier(entry: IncomeEntry, categories: CommissionCategory[]): CommissionTier | null {
  const category = getCommissionCategory(entry, categories)
  const tiers = category?.tiers ?? []
  if (!category || tiers.length === 0) {
    return null
  }

  const orderedTiers = [...tiers].sort((left, right) => left.minItems - right.minItems)

  let match = orderedTiers[0] ?? null
  for (const tier of orderedTiers) {
    if (safeNumber(entry.unitsSold) >= safeNumber(tier.minItems)) {
      match = tier
    }
  }

  return match
}

function getEffectiveCommissionValueType(
  entry: IncomeEntry,
  categories: CommissionCategory[],
): CommissionValueType {
  if (entry.type === 'manual') {
    return 'fixed'
  }

  if (entry.commissionValueTypeOverride !== null) {
    return entry.commissionValueTypeOverride
  }

  return categories.find((category) => category.id === entry.commissionCategoryId)?.valueType ?? 'percentage'
}

function calculateIncomeTotal(
  entry: IncomeEntry,
  profile: UserProfile | null,
  categories: CommissionCategory[],
): number {
  if (entry.type === 'manual') {
    return entry.manualAmount
  }

  const hourlyIncome = entry.hours * getEffectiveHourlyIncome(entry, profile)
  const commissionRate = getEffectiveCommissionRate(entry, categories)
  const commissionValueType = getEffectiveCommissionValueType(entry, categories)
  const applicableTier = getApplicableTier(entry, categories)
  const commissionIncome =
    commissionValueType === 'percentage'
      ? safeNumber(entry.salesAmount) * (commissionRate / 100)
      : commissionValueType === 'tiered-per-item'
        ? safeNumber(entry.unitsSold) * safeNumber(applicableTier?.amountPerItem ?? 0)
        : commissionRate

  return safeNumber(hourlyIncome) + safeNumber(commissionIncome)
}

function useUserCollection<T extends EditableRecord>(collectionName: string, uid: string | null) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setData([])
    setLoading(true)
    setError(null)

    if (!db || !uid) {
      setLoading(false)
      return
    }

    const unsubscribe = onSnapshot(
      collection(db, 'users', uid, collectionName),
      (snapshot) => {
        setData(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as T))
        setLoading(false)
      },
      (snapshotError) => {
        setError(snapshotError.message)
        setLoading(false)
      },
    )

    return () => unsubscribe()
  }, [collectionName, uid])

  const upsert = useCallback(
    async (record: Omit<T, 'id'> & Partial<Pick<T, 'id'>>) => {
      if (!db || !uid) {
        throw new Error('Database not initialized')
      }

      if (record.id) {
        await setDoc(doc(db, 'users', uid, collectionName, record.id), record, { merge: true })
        return
      }

      const { id: _discard, ...payload } = record
      await addDoc(collection(db, 'users', uid, collectionName), payload)
    },
    [collectionName, uid],
  )

  const remove = useCallback(
    async (id: string) => {
      if (!db || !uid) {
        throw new Error('Database not initialized')
      }

      await deleteDoc(doc(db, 'users', uid, collectionName, id))
    },
    [collectionName, uid],
  )

  return { data, loading, error, upsert, remove }
}

function useUserProfile(uid: string | null) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setProfile(null)
    setLoading(true)

    if (!db || !uid) {
      setLoading(false)
      return
    }

    const localKey = `zenobudget-profile-${uid}`
    const cachedProfile = localStorage.getItem(localKey)
    if (cachedProfile) {
      try {
        setProfile(JSON.parse(cachedProfile) as UserProfile)
      } catch {
        localStorage.removeItem(localKey)
      }
    }

    const profileRef = doc(db, 'users', uid, 'meta', 'profile')
    const unsubscribe = onSnapshot(
      profileRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const nextProfile = {
            id: snapshot.id,
            ...(snapshot.data() as Omit<UserProfile, 'id'>),
          }
          setProfile(nextProfile)
          localStorage.setItem(localKey, JSON.stringify(nextProfile))
        } else {
          setProfile(null)
          localStorage.removeItem(localKey)
        }
        setLoading(false)
      },
      () => {
        setLoading(false)
      },
    )

    return () => unsubscribe()
  }, [uid])

  const save = useCallback(
    async (next: Omit<UserProfile, 'id'>) => {
      if (!db || !uid) {
        throw new Error('Database not initialized')
      }

      const localKey = `zenobudget-profile-${uid}`
      const nextProfile: UserProfile = { id: 'profile', ...next }
      setProfile(nextProfile)
      localStorage.setItem(localKey, JSON.stringify(nextProfile))

      await setDoc(doc(db, 'users', uid, 'meta', 'profile'), next, { merge: true })
    },
    [uid],
  )

  return { profile, loading, save }
}

function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState<FirebaseUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authInfo, setAuthInfo] = useState<string | null>(null)
  const [verificationInfo, setVerificationInfo] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayNameInput, setDisplayNameInput] = useState('')
  const [settingsDraft, setSettingsDraft] = useState({
    displayName: '',
    defaultHourlyIncome: 0,
    currency: 'USD',
    payUploadFrequency: 'biweekly' as PayUploadFrequency,
  })
  const [settingsInfo, setSettingsInfo] = useState<string | null>(null)
  const [settingsError, setSettingsError] = useState(false)
  const [isEditingSettings, setIsEditingSettings] = useState(false)

  const [activeTab, setActiveTab] = useState<Tab>(() => resolveTabFromPath(window.location.pathname) ?? 'overview')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedRoutineDate, setSelectedRoutineDate] = useState(todayIso)

  const [routineDraft, setRoutineDraft] = useState<Omit<RoutineEntry, 'id'> & { id?: string }>(
    emptyRoutine,
  )
  const [incomeDraft, setIncomeDraft] = useState<Omit<IncomeEntry, 'id'> & { id?: string }>(
    emptyIncome,
  )
  const [budgetDraft, setBudgetDraft] = useState<Omit<BudgetEntry, 'id'> & { id?: string }>(
    emptyBudget,
  )
  const [commitmentDraft, setCommitmentDraft] = useState<
    Omit<BudgetCommitmentEntry, 'id'> & { id?: string }
  >(emptyBudgetCommitment)
  const [creditCardDraft, setCreditCardDraft] = useState<
    Omit<CreditCardEntry, 'id'> & { id?: string }
  >(emptyCreditCard)
  const [showCreditCardForm, setShowCreditCardForm] = useState(false)
  const [showCommitmentForm, setShowCommitmentForm] = useState(false)
  const [showBudgetForm, setShowBudgetForm] = useState(false)
  const [showHubExpenseForm, setShowHubExpenseForm] = useState(false)
  const [expenseDraft, setExpenseDraft] = useState<Omit<ExpenseEntry, 'id'> & { id?: string }>(
    emptyExpense,
  )
  const [commissionDraft, setCommissionDraft] = useState<
    Omit<CommissionCategory, 'id'> & { id?: string }
  >(emptyCommissionCategory)
  const [templateDraft, setTemplateDraft] = useState<
    Omit<CommissionTemplate, 'id'> & { id?: string }
  >(emptyCommissionTemplate)
  const [hubSelectedDate, setHubSelectedDate] = useState(todayIso)
  const [hubCalendarOpen, setHubCalendarOpen] = useState(false)
  const [hubCalendarMonth, setHubCalendarMonth] = useState(() => parseISO(todayIso))
  const [expenseCalendarOpen, setExpenseCalendarOpen] = useState(false)
  const [expenseCalendarMonth, setExpenseCalendarMonth] = useState(() => parseISO(todayIso))
  const [hubDayMode, setHubDayMode] = useState<HubDayMode>('working')
  const [hubHoursWorked, setHubHoursWorked] = useState(8)
  const [hubHourlyRateOverride, setHubHourlyRateOverride] = useState<number | null>(null)
  const [hubRows, setHubRows] = useState<HubCommissionRow[]>([makeHubCommissionRow()])
  const [hubGeneralNotes, setHubGeneralNotes] = useState('')
  const [hubShowReview, setHubShowReview] = useState(false)
  const [hubEditMode, setHubEditMode] = useState(false)
  const [hubInfo, setHubInfo] = useState<string | null>(null)
  const [hubError, setHubError] = useState<string | null>(null)
  const [incomeScreen, setIncomeScreen] = useState<IncomeScreen>('ledger')
  const [ledgerSearch, setLedgerSearch] = useState('')
  const [ledgerGroupBy, setLedgerGroupBy] = useState<LedgerGroupBy>('month')
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<LedgerTypeFilter>('all')
  const [ledgerCategoryFilter, setLedgerCategoryFilter] = useState('all')
  const [ledgerDateFrom, setLedgerDateFrom] = useState('')
  const [ledgerDateTo, setLedgerDateTo] = useState('')
  const [ledgerSortOrder, setLedgerSortOrder] = useState<'desc' | 'asc'>('desc')
  const [hubExpenseSearch, setHubExpenseSearch] = useState('')
  const [hubExpenseCategoryFilter, setHubExpenseCategoryFilter] = useState('all')
  const [hubExpenseDateFrom, setHubExpenseDateFrom] = useState('')
  const [hubExpenseDateTo, setHubExpenseDateTo] = useState('')
  const [payUploadDraft, setPayUploadDraft] = useState({
    startDate: todayIso,
    endDate: todayIso,
    paymentDate: todayIso,
    actualIncome: 0,
    notes: '',
  })
  const [payUploadInfo, setPayUploadInfo] = useState<string | null>(null)
  const [payUploadError, setPayUploadError] = useState<string | null>(null)
  const hubCalendarRef = useRef<HTMLDivElement | null>(null)
  const expenseCalendarRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setAuthLoading(false)
      return
    }

    const unsubscribe = subscribeToAuth((nextUser) => {
      setUser(nextUser)
      setAuthLoading(false)
    })

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (isLoginPath(location.pathname)) {
      return
    }

    const routeTab = resolveTabFromPath(location.pathname)

    if (routeTab) {
      setActiveTab((previous) => (previous === routeTab ? previous : routeTab))
      return
    }

    if (user) {
      navigate(tabToPath.overview, { replace: true })
      return
    }

    navigate('/login', { replace: true })
  }, [location.pathname, navigate, user])

  useEffect(() => {
    if (!isFirebaseConfigured || authLoading) {
      return
    }

    const isAuthRoute = isLoginPath(location.pathname)

    if (!user && !isAuthRoute) {
      navigate('/login', { replace: true })
      return
    }

    if (user && isAuthRoute) {
      navigate(tabToPath.overview, { replace: true })
    }
  }, [authLoading, location.pathname, navigate, user])

  const navigateToTab = useCallback(
    (tab: Tab) => {
      setActiveTab(tab)
      navigate(tabToPath[tab])
    },
    [navigate],
  )

  const uid = user?.uid ?? null

  const routinesStore = useUserCollection<RoutineEntry>('routines', uid)
  const incomesStore = useUserCollection<IncomeEntry>('incomes', uid)
  const budgetsStore = useUserCollection<BudgetEntry>('budgets', uid)
  const commitmentsStore = useUserCollection<BudgetCommitmentEntry>('budgetCommitments', uid)
  const creditCardsStore = useUserCollection<CreditCardEntry>('budgetCreditCards', uid)
  const expensesStore = useUserCollection<ExpenseEntry>('expenses', uid)
  const commissionsStore = useUserCollection<CommissionCategory>('commissionCategories', uid)
  const commissionTemplatesStore = useUserCollection<CommissionTemplate>('commissionTemplates', uid)
  const payUploadsStore = useUserCollection<PayUploadEntry>('payUploads', uid)
  const profileStore = useUserProfile(uid)

  useEffect(() => {
    if (!incomeDraft.commissionCategoryId && commissionsStore.data.length > 0) {
      setIncomeDraft((previous) => ({ ...previous, commissionCategoryId: commissionsStore.data[0].id }))
    }
  }, [commissionsStore.data, incomeDraft.commissionCategoryId])

  useEffect(() => {
    if (!profileStore.profile) {
      return
    }

    setSettingsDraft({
      displayName: profileStore.profile.displayName,
      defaultHourlyIncome: profileStore.profile.defaultHourlyIncome,
      currency: profileStore.profile.currency,
      payUploadFrequency:
        (profileStore.profile.payUploadFrequency as PayUploadFrequency | undefined) ?? 'biweekly',
    })
    setIsEditingSettings(false)
  }, [profileStore.profile])

  useEffect(() => {
    if (!db || !uid || !profileStore.profile?.lastPayUploadDate) {
      return
    }

    void setDoc(
      doc(db, 'users', uid, 'meta', 'profile'),
      { lastPayUploadDate: null },
      { merge: true },
    )
  }, [profileStore.profile?.lastPayUploadDate, uid])

  useEffect(() => {
    if (!templateDraft.commissionCategoryId && commissionsStore.data.length > 0) {
      setTemplateDraft((previous) => ({ ...previous, commissionCategoryId: commissionsStore.data[0].id }))
    }
  }, [commissionsStore.data, templateDraft.commissionCategoryId])

  useEffect(() => {
    setHubCalendarMonth(parseISO(hubSelectedDate))
  }, [hubSelectedDate])

  useEffect(() => {
    if (!expenseDraft.date) {
      return
    }

    setExpenseCalendarMonth(parseISO(expenseDraft.date))
  }, [expenseDraft.date])

  useEffect(() => {
    setHubEditMode(false)
    setHubShowReview(false)
  }, [hubSelectedDate])

  useEffect(() => {
    if (!hubCalendarOpen) {
      return
    }

    const handleDocumentMouseDown = (event: MouseEvent) => {
      if (!hubCalendarRef.current?.contains(event.target as Node)) {
        setHubCalendarOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setHubCalendarOpen(false)
      }
    }

    document.addEventListener('mousedown', handleDocumentMouseDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [hubCalendarOpen])

  useEffect(() => {
    if (!expenseCalendarOpen) {
      return
    }

    const handleDocumentMouseDown = (event: MouseEvent) => {
      if (!expenseCalendarRef.current?.contains(event.target as Node)) {
        setExpenseCalendarOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpenseCalendarOpen(false)
      }
    }

    document.addEventListener('mousedown', handleDocumentMouseDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [expenseCalendarOpen])

  useEffect(() => {
    if (!user || commissionTemplatesStore.loading || incomesStore.loading) {
      return
    }

    const activeTemplates = commissionTemplatesStore.data.filter((template) => template.active)
    if (activeTemplates.length === 0) {
      return
    }

    const targetMonths = [format(new Date(), 'yyyy-MM'), format(addMonths(new Date(), 1), 'yyyy-MM')]

    for (const template of activeTemplates) {
      for (const month of targetMonths) {
        const exists = incomesStore.data.some(
          (entry) =>
            entry.generatedFromTemplateId === template.id &&
            entry.generatedForMonth === month &&
            entry.type === 'commission',
        )

        if (exists) {
          continue
        }

        const day = Math.max(1, Math.min(template.dayOfMonth, 28))
        const date = `${month}-${String(day).padStart(2, '0')}`

        void incomesStore.upsert({
          date,
          type: 'commission',
          generatedFromTemplateId: template.id,
          generatedForMonth: month,
          commissionCategoryId: template.commissionCategoryId,
          commissionValueTypeOverride: null,
          commissionRateOverride: null,
          hourlyRateOverride: null,
          hours: template.defaultHours,
          unitsSold: template.expectedUnitsSold,
          salesAmount: template.expectedSalesAmount,
          manualAmount: 0,
          notes: `Auto-projected from template: ${template.name}`,
        })
      }
    }
  }, [
    commissionTemplatesStore.data,
    commissionTemplatesStore.loading,
    incomesStore.data,
    incomesStore.loading,
    incomesStore.upsert,
    user,
  ])

  const loadingAny =
    authLoading ||
    profileStore.loading ||
    routinesStore.loading ||
    incomesStore.loading ||
    budgetsStore.loading ||
    commitmentsStore.loading ||
    creditCardsStore.loading ||
    expensesStore.loading ||
    commissionsStore.loading ||
    commissionTemplatesStore.loading ||
    payUploadsStore.loading

  const routineCountByDate = useMemo(() => {
    return routinesStore.data.reduce<Record<string, number>>((accumulator, item) => {
      accumulator[item.date] = (accumulator[item.date] ?? 0) + 1
      return accumulator
    }, {})
  }, [routinesStore.data])

  const selectedDateRoutines = useMemo(() => {
    return routinesStore.data
      .filter((item) => item.date === selectedRoutineDate)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
  }, [routinesStore.data, selectedRoutineDate])

  const currentMonthKey = format(currentMonth, 'yyyy-MM')
  const currency = profileStore.profile?.currency ?? 'USD'
  const payUploadFrequency: PayUploadFrequency =
    (profileStore.profile?.payUploadFrequency as PayUploadFrequency | undefined) ?? 'biweekly'
  const accountCreationIso = useMemo(() => {
    const raw = user?.metadata.creationTime
    if (!raw) {
      return todayIso
    }

    return format(new Date(raw), 'yyyy-MM-dd')
  }, [user?.metadata.creationTime])

  const monthIncome = useMemo(() => {
    return incomesStore.data
      .filter((item) => monthKeyFromIso(item.date) === currentMonthKey)
      .reduce(
        (total, item) =>
          total + calculateIncomeTotal(item, profileStore.profile, commissionsStore.data),
        0,
      )
  }, [commissionsStore.data, currentMonthKey, incomesStore.data, profileStore.profile])

  const monthExpenses = useMemo(() => {
    return expensesStore.data
      .filter((item) => monthKeyFromIso(item.date) === currentMonthKey)
      .reduce((total, item) => total + item.amount, 0)
  }, [currentMonthKey, expensesStore.data])

  const monthBudgetLimit = useMemo(() => {
    return budgetsStore.data.reduce((total, item) => total + item.monthlyLimit, 0)
  }, [budgetsStore.data])

  const chartData = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, index) =>
      format(subMonths(new Date(), 5 - index), 'yyyy-MM'),
    )

    return months.map((month) => {
      const income = incomesStore.data
        .filter((item) => monthKeyFromIso(item.date) === month)
        .reduce(
          (total, item) =>
            total + calculateIncomeTotal(item, profileStore.profile, commissionsStore.data),
          0,
        )
      const expenses = expensesStore.data
        .filter((item) => monthKeyFromIso(item.date) === month)
        .reduce((total, item) => total + item.amount, 0)

      return {
        label: format(parseISO(`${month}-01`), 'MMM yy'),
        income,
        expenses,
      }
    })
  }, [commissionsStore.data, expensesStore.data, incomesStore.data, profileStore.profile])

  const expensesByCategory = useMemo(() => {
    const base = budgetsStore.data.map((budget) => ({
      ...budget,
      spent: expensesStore.data
        .filter((expense) => expense.categoryId === budget.id)
        .reduce((total, expense) => total + expense.amount, 0),
    }))

    return base.sort((a, b) => b.spent - a.spent)
  }, [budgetsStore.data, expensesStore.data])

  const budgetCategorySummary = useMemo(() => {
    return expensesByCategory.reduce(
      (summary, item) => {
        const limit = safeNumber(item.monthlyLimit)
        const spent = safeNumber(item.spent)
        summary.limit += limit
        summary.spent += spent
        summary.overspent += limit > 0 && spent > limit ? 1 : 0
        return summary
      },
      { limit: 0, spent: 0, overspent: 0 },
    )
  }, [expensesByCategory])

  const hubExpenseEntries = useMemo(() => {
    const query = hubExpenseSearch.trim().toLowerCase()

    return expensesStore.data
      .filter((item) => {
        if (hubExpenseCategoryFilter !== 'all' && item.categoryId !== hubExpenseCategoryFilter) {
          return false
        }

        if (hubExpenseDateFrom && item.date < hubExpenseDateFrom) {
          return false
        }

        if (hubExpenseDateTo && item.date > hubExpenseDateTo) {
          return false
        }

        if (query.length === 0) {
          return true
        }

        const categoryName =
          budgetsStore.data.find((category) => category.id === item.categoryId)?.category ?? 'Unknown category'
        const creditCardName =
          creditCardsStore.data.find((card) => card.id === item.creditCardId)?.name ?? ''

        const searchText = [
          item.date,
          item.description,
          item.notes,
          categoryName,
          creditCardName,
          item.paymentSource ?? 'cash',
          String(item.amount),
        ]
          .join(' ')
          .toLowerCase()

        return searchText.includes(query)
      })
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [
    budgetsStore.data,
    creditCardsStore.data,
    expensesStore.data,
    hubExpenseCategoryFilter,
    hubExpenseDateFrom,
    hubExpenseDateTo,
    hubExpenseSearch,
  ])

  const hubExpenseSummary = useMemo(() => {
    const selectedDayTotal = expensesStore.data
      .filter((item) => item.date === hubSelectedDate)
      .reduce((sum, item) => sum + safeNumber(item.amount), 0)

    const monthTotal = expensesStore.data
      .filter((item) => monthKeyFromIso(item.date) === currentMonthKey)
      .reduce((sum, item) => sum + safeNumber(item.amount), 0)

    return {
      selectedDayTotal,
      monthTotal,
      allTimeTotal: expensesStore.data.reduce((sum, item) => sum + safeNumber(item.amount), 0),
      count: expensesStore.data.length,
      visibleCount: hubExpenseEntries.length,
      visibleTotal: hubExpenseEntries.reduce((sum, item) => sum + safeNumber(item.amount), 0),
    }
  }, [currentMonthKey, expensesStore.data, hubExpenseEntries, hubSelectedDate])

  const commitmentTypeMeta: Record<
    BudgetCommitmentType,
    { direction: BudgetFlowDirection; group: string; color: string; label: string }
  > = {
    loan: { direction: 'payment', group: 'Debt', color: '#0f766e', label: 'Loan' },
    rent: { direction: 'payment', group: 'Housing', color: '#0369a1', label: 'Rent' },
    mortgage: { direction: 'payment', group: 'Housing', color: '#1d4ed8', label: 'Mortgage' },
    receivable: { direction: 'collection', group: 'Collections', color: '#16a34a', label: 'Receivable' },
    utility: { direction: 'payment', group: 'Utilities', color: '#ea580c', label: 'Utility' },
    subscription: { direction: 'payment', group: 'Subscriptions', color: '#7c3aed', label: 'Subscription' },
    insurance: { direction: 'payment', group: 'Insurance', color: '#0891b2', label: 'Insurance' },
    other: { direction: 'payment', group: 'Other', color: '#64748b', label: 'Other' },
  }

  const initialCommitments = useMemo(() => {
    return commitmentsStore.data.slice().sort((a, b) => b.currentAmount - a.currentAmount)
  }, [commitmentsStore.data])

  const initialCommitmentSummary = useMemo(() => {
    return initialCommitments.reduce(
      (summary, item) => {
        if (item.direction === 'collection') {
          summary.collections += safeNumber(item.currentAmount)
        } else {
          summary.payments += safeNumber(item.currentAmount)
        }

        return summary
      },
      { payments: 0, collections: 0 },
    )
  }, [initialCommitments])

  const linkedSubscriptionByCard = useMemo(() => {
    return initialCommitments.reduce<Record<string, number>>((totals, item) => {
      if (item.type !== 'subscription' || item.direction !== 'payment' || !item.active) {
        return totals
      }

      const cardId = item.linkedCreditCardId
      if (!cardId) {
        return totals
      }

      totals[cardId] = (totals[cardId] ?? 0) + safeNumber(item.currentAmount)
      return totals
    }, {})
  }, [initialCommitments])

  const creditCards = useMemo(() => {
    return creditCardsStore.data
      .filter((item) => item.active)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [creditCardsStore.data])

  const selectedExpenseCreditCard = useMemo(() => {
    if (expenseDraft.paymentSource !== 'credit-card' || !expenseDraft.creditCardId) {
      return null
    }

    return creditCardsStore.data.find((card) => card.id === expenseDraft.creditCardId) ?? null
  }, [creditCardsStore.data, expenseDraft.creditCardId, expenseDraft.paymentSource])

  const expenseDraftInterestPreview = useMemo(() => {
    if (!selectedExpenseCreditCard || expenseDraft.paymentSource !== 'credit-card') {
      return 0
    }

    return calculateProratedAprInterest(
      safeNumber(expenseDraft.amount),
      safeNumber(selectedExpenseCreditCard.apr),
      expenseDraft.date,
    )
  }, [expenseDraft.amount, expenseDraft.date, expenseDraft.paymentSource, selectedExpenseCreditCard])

  const expenseDraftCardChargePreview = useMemo(() => {
    if (expenseDraft.paymentSource !== 'credit-card') {
      return 0
    }

    return roundCurrency(safeNumber(expenseDraft.amount) + expenseDraftInterestPreview)
  }, [expenseDraft.amount, expenseDraft.paymentSource, expenseDraftInterestPreview])

  const saveExpenseEntry = useCallback(async () => {
    const normalizedAmount = safeNumber(expenseDraft.amount)
    const isCreditCardExpense = expenseDraft.paymentSource === 'credit-card'
    const normalizedCardId = isCreditCardExpense ? expenseDraft.creditCardId ?? null : null

    const previousEntry = expenseDraft.id
      ? expensesStore.data.find((entry) => entry.id === expenseDraft.id) ?? null
      : null

    let nextInterestAmount = 0
    let nextCardChargeTotal = 0

    if (isCreditCardExpense) {
      if (!normalizedCardId) {
        throw new Error('Select a credit card for this expense.')
      }

      const linkedCard = creditCardsStore.data.find((card) => card.id === normalizedCardId)
      if (!linkedCard) {
        throw new Error('The selected credit card is not available.')
      }

      nextInterestAmount = calculateProratedAprInterest(
        normalizedAmount,
        safeNumber(linkedCard.apr),
        expenseDraft.date,
      )
      nextCardChargeTotal = roundCurrency(normalizedAmount + nextInterestAmount)
    }

    const usageDeltaByCard: Record<string, number> = {}

    if (previousEntry?.creditCardId && safeNumber(previousEntry.creditCardChargeTotal ?? 0) > 0) {
      usageDeltaByCard[previousEntry.creditCardId] =
        (usageDeltaByCard[previousEntry.creditCardId] ?? 0) -
        safeNumber(previousEntry.creditCardChargeTotal ?? 0)
    }

    if (normalizedCardId && nextCardChargeTotal > 0) {
      usageDeltaByCard[normalizedCardId] =
        (usageDeltaByCard[normalizedCardId] ?? 0) + safeNumber(nextCardChargeTotal)
    }

    await Promise.all(
      Object.entries(usageDeltaByCard).map(async ([cardId, delta]) => {
        if (Math.abs(delta) < 0.005) {
          return
        }

        const card = creditCardsStore.data.find((entry) => entry.id === cardId)
        if (!card) {
          return
        }

        await creditCardsStore.upsert({
          ...card,
          currentUsage: roundCurrency(Math.max(0, safeNumber(card.currentUsage) + delta)),
        })
      }),
    )

    await expensesStore.upsert({
      ...expenseDraft,
      amount: normalizedAmount,
      description: expenseDraft.description.trim(),
      notes: expenseDraft.notes.trim(),
      paymentSource: isCreditCardExpense ? 'credit-card' : 'cash',
      creditCardId: normalizedCardId,
      creditCardInterestAmount: roundCurrency(nextInterestAmount),
      creditCardChargeTotal: roundCurrency(nextCardChargeTotal),
    })

    setExpenseDraft({ ...emptyExpense(), date: hubSelectedDate })
    setExpenseCalendarOpen(false)
    setShowHubExpenseForm(false)
  }, [
    creditCardsStore,
    expenseDraft,
    expensesStore,
    hubSelectedDate,
  ])

  const removeExpenseEntry = useCallback(
    async (entry: ExpenseEntry) => {
      if (entry.creditCardId && safeNumber(entry.creditCardChargeTotal ?? 0) > 0) {
        const card = creditCardsStore.data.find((item) => item.id === entry.creditCardId)
        if (card) {
          await creditCardsStore.upsert({
            ...card,
            currentUsage: roundCurrency(
              Math.max(0, safeNumber(card.currentUsage) - safeNumber(entry.creditCardChargeTotal ?? 0)),
            ),
          })
        }
      }

      await expensesStore.remove(entry.id)
    },
    [creditCardsStore, expensesStore],
  )

  const creditCardSummary = useMemo(() => {
    const totals = creditCards.reduce(
      (sum, card) => {
        const linkedSubscriptionUsage = safeNumber(linkedSubscriptionByCard[card.id] ?? 0)
        const cardUsage = safeNumber(card.currentUsage) + linkedSubscriptionUsage
        const cardProjectedInterest = roundCurrency(cardUsage * (safeNumber(card.apr) / 100 / 12))
        sum.limit += safeNumber(card.creditLimit)
        sum.usage += cardUsage
        sum.subscriptionUsage += linkedSubscriptionUsage
        sum.minimumPayment += safeNumber(card.minimumPayment)
        sum.projectedMonthlyInterest += cardProjectedInterest
        return sum
      },
      { limit: 0, usage: 0, subscriptionUsage: 0, minimumPayment: 0, projectedMonthlyInterest: 0 },
    )

    const available = totals.limit - totals.usage
    const utilizationRate = totals.limit > 0 ? (totals.usage / totals.limit) * 100 : 0

    return {
      ...totals,
      available,
      utilizationRate,
      weightedAprRate:
        totals.usage > 0
          ? (totals.projectedMonthlyInterest * 12 * 100) / totals.usage
          : 0,
    }
  }, [creditCards, linkedSubscriptionByCard])

  const overviewIncomeSummary = useMemo(() => {
    const summary = incomesStore.data.reduce(
      (accumulator, item) => {
        const total = calculateIncomeTotal(item, profileStore.profile, commissionsStore.data)
        accumulator.total += total

        if (item.type === 'commission') {
          accumulator.commissionCount += 1
          accumulator.commissionTotal += total
        } else {
          accumulator.manualCount += 1
          accumulator.manualTotal += total
        }

        return accumulator
      },
      {
        total: 0,
        commissionCount: 0,
        commissionTotal: 0,
        manualCount: 0,
        manualTotal: 0,
      },
    )

    const entryCount = incomesStore.data.length
    const averageEntry = entryCount > 0 ? summary.total / entryCount : 0

    return {
      ...summary,
      entryCount,
      averageEntry,
    }
  }, [commissionsStore.data, incomesStore.data, profileStore.profile])

  const overviewIncomeByCategory = useMemo(() => {
    const categoryTotals = new Map<string, { name: string; amount: number }>()

    for (const income of incomesStore.data) {
      if (income.type !== 'commission') {
        continue
      }

      const category = commissionsStore.data.find((item) => item.id === income.commissionCategoryId)
      const key = category?.id ?? 'uncategorized'
      const name = category?.name ?? 'Uncategorized Commission'
      const amount = calculateIncomeTotal(income, profileStore.profile, commissionsStore.data)
      const existing = categoryTotals.get(key)

      if (!existing) {
        categoryTotals.set(key, { name, amount })
      } else {
        existing.amount += amount
      }
    }

    return Array.from(categoryTotals.values())
      .sort((left, right) => right.amount - left.amount)
      .slice(0, 6)
  }, [commissionsStore.data, incomesStore.data, profileStore.profile])

  const overviewBudgetSummary = useMemo(() => {
    const totals = expensesByCategory.reduce(
      (sum, item) => {
        sum.limit += safeNumber(item.monthlyLimit)
        sum.spent += safeNumber(item.spent)
        if (item.monthlyLimit > 0 && item.spent > item.monthlyLimit) {
          sum.overspent += 1
        }
        return sum
      },
      { limit: 0, spent: 0, overspent: 0 },
    )

    const remaining = totals.limit - totals.spent
    const utilizationRate = totals.limit > 0 ? (totals.spent / totals.limit) * 100 : 0

    return {
      ...totals,
      remaining,
      utilizationRate,
      categories: expensesByCategory.length,
    }
  }, [expensesByCategory])

  const overviewCommitmentByType = useMemo(() => {
    const totals = new Map<string, number>()

    for (const item of initialCommitments) {
      const label = commitmentTypeMeta[item.type].label
      totals.set(label, (totals.get(label) ?? 0) + safeNumber(item.currentAmount))
    }

    return Array.from(totals.entries())
      .map(([label, amount]) => ({ label, amount }))
      .sort((left, right) => right.amount - left.amount)
  }, [commitmentTypeMeta, initialCommitments])

  const overviewUpcomingDates = useMemo(() => {
    const upcoming: Array<{ label: string; day: number; type: 'commitment' | 'card-due' | 'card-interest' }> = []

    for (const item of initialCommitments) {
      if (item.dueDay !== null && item.active) {
        upcoming.push({
          label: item.name,
          day: item.dueDay,
          type: 'commitment',
        })
      }
    }

    for (const card of creditCards) {
      if (card.dueDay !== null) {
        upcoming.push({
          label: `${card.name} payment`,
          day: card.dueDay,
          type: 'card-due',
        })
      }
      if (card.interestChargeDay !== null) {
        upcoming.push({
          label: `${card.name} interest`,
          day: card.interestChargeDay,
          type: 'card-interest',
        })
      }
    }

    return upcoming.sort((left, right) => left.day - right.day).slice(0, 10)
  }, [creditCards, initialCommitments])

  const overviewIncomeTypeChart = useMemo(() => {
    return [
      { name: 'Commission', value: overviewIncomeSummary.commissionTotal, color: '#0f766e' },
      { name: 'Manual', value: overviewIncomeSummary.manualTotal, color: '#ea580c' },
    ].filter((item) => item.value > 0)
  }, [overviewIncomeSummary.commissionTotal, overviewIncomeSummary.manualTotal])

  const ledgerFilteredEntries = useMemo(() => {
    const query = ledgerSearch.trim().toLowerCase()

    const filtered = incomesStore.data.filter((item) => {
      if (ledgerTypeFilter !== 'all' && item.type !== ledgerTypeFilter) {
        return false
      }

      if (ledgerCategoryFilter !== 'all') {
        if (item.type !== 'commission' || item.commissionCategoryId !== ledgerCategoryFilter) {
          return false
        }
      }

      if (ledgerDateFrom && item.date < ledgerDateFrom) {
        return false
      }

      if (ledgerDateTo && item.date > ledgerDateTo) {
        return false
      }

      const categoryName = commissionsStore.data.find((category) => category.id === item.commissionCategoryId)?.name ?? ''
      const entryTotal = calculateIncomeTotal(item, profileStore.profile, commissionsStore.data)

      const searchText = [
        item.date,
        format(parseISO(item.date), 'EEE MMM d yyyy'),
        item.type,
        categoryName,
        item.notes,
        String(entryTotal),
      ]
        .join(' ')
        .toLowerCase()

      return query.length === 0 || searchText.includes(query)
    })

    return filtered
      .map((item) => {
        const category = commissionsStore.data.find((entry) => entry.id === item.commissionCategoryId)
        return {
          item,
          category,
          entryTotal: calculateIncomeTotal(item, profileStore.profile, commissionsStore.data),
        }
      })
      .sort((left, right) => {
        const dateOrder =
          ledgerSortOrder === 'desc'
            ? right.item.date.localeCompare(left.item.date)
            : left.item.date.localeCompare(right.item.date)

        if (dateOrder !== 0) {
          return dateOrder
        }

        return ledgerSortOrder === 'desc'
          ? right.item.id.localeCompare(left.item.id)
          : left.item.id.localeCompare(right.item.id)
      })
  }, [
    commissionsStore.data,
    incomesStore.data,
    ledgerCategoryFilter,
    ledgerDateFrom,
    ledgerDateTo,
    ledgerSearch,
    ledgerSortOrder,
    ledgerTypeFilter,
    profileStore.profile,
  ])

  const ledgerGroupedEntries = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string
        label: string
        startDate: Date
        endDate: Date
        entries: typeof ledgerFilteredEntries
        total: number
      }
    >()

    for (const entry of ledgerFilteredEntries) {
      const entryDate = parseISO(entry.item.date)

      let key = entry.item.date
      let label = format(entryDate, 'EEE, MMM d, yyyy')
      let startDate = entryDate
      let endDate = entryDate

      if (ledgerGroupBy === 'week') {
        startDate = startOfWeek(entryDate, { weekStartsOn: 1 })
        endDate = endOfWeek(entryDate, { weekStartsOn: 1 })
        key = `week-${format(startDate, 'yyyy-MM-dd')}`
        label = `${format(startDate, 'MMM d, yyyy')} to ${format(endDate, 'MMM d, yyyy')}`
      } else if (ledgerGroupBy === 'biweekly') {
        startDate = startOfBiweeklyPeriod(entryDate)
        endDate = addDays(startDate, 13)
        key = `biweekly-${format(startDate, 'yyyy-MM-dd')}`
        label = `${format(startDate, 'MMM d, yyyy')} to ${format(endDate, 'MMM d, yyyy')}`
      } else if (ledgerGroupBy === 'month') {
        startDate = startOfMonth(entryDate)
        endDate = endOfMonth(entryDate)
        key = `month-${format(startDate, 'yyyy-MM')}`
        label = format(startDate, 'MMMM yyyy')
      } else if (ledgerGroupBy === 'year') {
        startDate = startOfYear(entryDate)
        endDate = endOfYear(entryDate)
        key = `year-${format(startDate, 'yyyy')}`
        label = format(startDate, 'yyyy')
      }

      const existing = groups.get(key)

      if (!existing) {
        groups.set(key, {
          key,
          label,
          startDate,
          endDate,
          entries: [entry],
          total: entry.entryTotal,
        })
      } else {
        existing.entries.push(entry)
        existing.total += entry.entryTotal
      }
    }

    return Array.from(groups.values())
      .sort((left, right) => {
        return ledgerSortOrder === 'desc'
          ? right.startDate.getTime() - left.startDate.getTime()
          : left.startDate.getTime() - right.startDate.getTime()
      })
      .map((group) => ({
        ...group,
        entries: group.entries.sort((left, right) => {
          const dateOrder =
            ledgerSortOrder === 'desc'
              ? right.item.date.localeCompare(left.item.date)
              : left.item.date.localeCompare(right.item.date)

          if (dateOrder !== 0) {
            return dateOrder
          }

          return ledgerSortOrder === 'desc'
            ? right.item.id.localeCompare(left.item.id)
            : left.item.id.localeCompare(right.item.id)
        }),
      }))
  }, [ledgerFilteredEntries, ledgerGroupBy, ledgerSortOrder])

  const ledgerFilteredTotal = useMemo(() => {
    return ledgerFilteredEntries.reduce((sum, entry) => sum + entry.entryTotal, 0)
  }, [ledgerFilteredEntries])

  const payUploadsByPaymentDate = useMemo(() => {
    return payUploadsStore.data
      .slice()
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
  }, [payUploadsStore.data])

  const hubSelectedDayEntries = useMemo(() => {
    return incomesStore.data
      .filter((entry) => entry.date === hubSelectedDate)
      .sort((a, b) => a.id.localeCompare(b.id))
  }, [hubSelectedDate, incomesStore.data])

  const hubSelectedDayEntriesTotal = useMemo(() => {
    return hubSelectedDayEntries.reduce(
      (sum, entry) => sum + calculateIncomeTotal(entry, profileStore.profile, commissionsStore.data),
      0,
    )
  }, [commissionsStore.data, hubSelectedDayEntries, profileStore.profile])

  const hubHasExistingRecords = hubSelectedDayEntries.length > 0

  const hubHourlyRate = useMemo(() => {
    return safeNumber(hubHourlyRateOverride ?? profileStore.profile?.defaultHourlyIncome ?? 0)
  }, [hubHourlyRateOverride, profileStore.profile])

  const hubValidRows = useMemo(() => {
    return hubRows.filter((row) => {
      if (!row.commissionCategoryId) {
        return false
      }

      const category = commissionsStore.data.find((item) => item.id === row.commissionCategoryId)
      if (!category) {
        return false
      }

      if (category.valueType === 'fixed') {
        return true
      }

      if (category.valueType === 'percentage') {
        return safeNumber(row.salesAmount) > 0
      }

      return safeNumber(row.unitsSold) > 0
    })
  }, [commissionsStore.data, hubRows])

  const hubCommissionsTotal = useMemo(() => {
    return hubValidRows.reduce((sum, row) => {
      const previewEntry: IncomeEntry = {
        id: row.id,
        date: hubSelectedDate,
        type: 'commission',
        generatedFromTemplateId: null,
        generatedForMonth: null,
        commissionCategoryId: row.commissionCategoryId,
        commissionValueTypeOverride: null,
        commissionRateOverride: null,
        hourlyRateOverride: null,
        hours: 0,
        unitsSold: safeNumber(row.unitsSold),
        salesAmount: safeNumber(row.salesAmount),
        manualAmount: 0,
        notes: row.notes,
      }

      return sum + calculateIncomeTotal(previewEntry, profileStore.profile, commissionsStore.data)
    }, 0)
  }, [commissionsStore.data, hubSelectedDate, hubValidRows, profileStore.profile])

  const hubHourlyTotal = useMemo(() => {
    return hubDayMode === 'working' ? safeNumber(hubHoursWorked) * hubHourlyRate : 0
  }, [hubDayMode, hubHourlyRate, hubHoursWorked])

  const hubDayTotal = useMemo(() => {
    if (hubDayMode === 'off') {
      return 0
    }

    return hubHourlyTotal + hubCommissionsTotal
  }, [hubCommissionsTotal, hubDayMode, hubHourlyTotal])

  const hubCommissionReviewRows = useMemo(() => {
    return hubValidRows.map((row) => {
      const category = commissionsStore.data.find((item) => item.id === row.commissionCategoryId)

      const previewEntry: IncomeEntry = {
        id: row.id,
        date: hubSelectedDate,
        type: 'commission',
        generatedFromTemplateId: null,
        generatedForMonth: null,
        commissionCategoryId: row.commissionCategoryId,
        commissionValueTypeOverride: null,
        commissionRateOverride: null,
        hourlyRateOverride: null,
        hours: 0,
        unitsSold: safeNumber(row.unitsSold),
        salesAmount: safeNumber(row.salesAmount),
        manualAmount: 0,
        notes: row.notes,
      }

      const valueType = getEffectiveCommissionValueType(previewEntry, commissionsStore.data)
      const rate = getEffectiveCommissionRate(previewEntry, commissionsStore.data)
      const tier = getApplicableTier(previewEntry, commissionsStore.data)
      const amount = calculateIncomeTotal(previewEntry, profileStore.profile, commissionsStore.data)

      return {
        id: row.id,
        categoryName: category?.name ?? 'Unknown category',
        valueType,
        unitsSold: safeNumber(row.unitsSold),
        salesAmount: safeNumber(row.salesAmount),
        rate,
        tier,
        amount,
        notes: row.notes,
      }
    })
  }, [commissionsStore.data, hubSelectedDate, hubValidRows, profileStore.profile])

  const hubMissingDaysCount = useMemo(() => {
    if (!accountCreationIso || !hubSelectedDate) {
      return 0
    }

    const start = parseISO(accountCreationIso)
    const end = parseISO(hubSelectedDate)
    const orderedStart = start <= end ? start : end
    const orderedEnd = start <= end ? end : start
    const availableDates = new Set(incomesStore.data.map((entry) => entry.date))

    return eachDayOfInterval({ start: orderedStart, end: orderedEnd }).reduce((count, day) => {
      const dayIso = format(day, 'yyyy-MM-dd')
      return availableDates.has(dayIso) ? count : count + 1
    }, 0)
  }, [accountCreationIso, hubSelectedDate, incomesStore.data])

  const incomeRecordedDates = useMemo(() => {
    return new Set(incomesStore.data.map((entry) => entry.date))
  }, [incomesStore.data])

  const firstMissingBeforeSelectedPostCreation = useMemo(() => {
    if (hubSelectedDate <= accountCreationIso) {
      return null
    }

    const intervalStart = parseISO(accountCreationIso)
    const intervalEnd = addDays(parseISO(hubSelectedDate), -1)

    if (intervalEnd < intervalStart) {
      return null
    }

    for (const day of eachDayOfInterval({ start: intervalStart, end: intervalEnd })) {
      const dayIso = format(day, 'yyyy-MM-dd')
      if (!incomeRecordedDates.has(dayIso)) {
        return dayIso
      }
    }

    return null
  }, [accountCreationIso, hubSelectedDate, incomeRecordedDates])

  const hubIsLockedByPayUpload = useMemo(() => {
    return payUploadsStore.data.some(
      (upload) => hubSelectedDate >= upload.startDate && hubSelectedDate <= upload.endDate,
    )
  }, [hubSelectedDate, payUploadsStore.data])

  const loadSelectedDayIntoHubDraft = useCallback(() => {
    const manualEntries = hubSelectedDayEntries.filter((entry) => entry.type === 'manual')
    const commissionEntries = hubSelectedDayEntries.filter((entry) => entry.type === 'commission')
    const manualTotal = manualEntries.reduce((sum, entry) => sum + safeNumber(entry.manualAmount), 0)

    const inferredDayMode: HubDayMode =
      commissionEntries.length === 0 && manualTotal === 0 ? 'off' : 'working'

    const inferredRows = commissionEntries.map((entry) => ({
      id: entry.id,
      commissionCategoryId: entry.commissionCategoryId,
      unitsSold: safeNumber(entry.unitsSold),
      salesAmount: safeNumber(entry.salesAmount),
      notes: entry.notes ?? '',
    }))

    const inferredHourlyRate = safeNumber(profileStore.profile?.defaultHourlyIncome ?? 0)
    const inferredHours =
      inferredDayMode === 'working' && manualTotal > 0 && inferredHourlyRate > 0
        ? Number((manualTotal / inferredHourlyRate).toFixed(2))
        : inferredDayMode === 'working'
          ? 8
          : 0

    const firstMeaningfulManualNote = manualEntries
      .map((entry) => entry.notes?.trim() ?? '')
      .find((note) => note && !note.startsWith('Data Hub:'))

    setHubDayMode(inferredDayMode)
    setHubHoursWorked(inferredHours)
    setHubHourlyRateOverride(null)
    setHubRows(inferredRows.length > 0 ? inferredRows : [makeHubCommissionRow()])
    setHubGeneralNotes(firstMeaningfulManualNote ?? '')
    setHubShowReview(false)
    setHubError(null)
    setHubInfo(null)
    setHubEditMode(true)
  }, [hubSelectedDayEntries, profileStore.profile])

  const estimatedIncomeForPayDraft = useMemo(() => {
    if (!payUploadDraft.startDate || !payUploadDraft.endDate) {
      return 0
    }

    return incomesStore.data
      .filter(
        (entry) => entry.date >= payUploadDraft.startDate && entry.date <= payUploadDraft.endDate,
      )
      .reduce(
        (sum, entry) => sum + calculateIncomeTotal(entry, profileStore.profile, commissionsStore.data),
        0,
      )
  }, [commissionsStore.data, incomesStore.data, payUploadDraft.endDate, payUploadDraft.startDate, profileStore.profile])

  const payDraftVariance = useMemo(() => {
    return safeNumber(payUploadDraft.actualIncome) - estimatedIncomeForPayDraft
  }, [estimatedIncomeForPayDraft, payUploadDraft.actualIncome])


  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)

    return eachDayOfInterval({
      start: startOfWeek(monthStart, { weekStartsOn: 1 }),
      end: endOfWeek(monthEnd, { weekStartsOn: 1 }),
    })
  }, [currentMonth])

  const hubCalendarDays = useMemo(() => {
    const monthStart = startOfMonth(hubCalendarMonth)
    const monthEnd = endOfMonth(hubCalendarMonth)

    return eachDayOfInterval({
      start: startOfWeek(monthStart, { weekStartsOn: 1 }),
      end: endOfWeek(monthEnd, { weekStartsOn: 1 }),
    })
  }, [hubCalendarMonth])

  const expenseCalendarDays = useMemo(() => {
    const monthStart = startOfMonth(expenseCalendarMonth)
    const monthEnd = endOfMonth(expenseCalendarMonth)

    return eachDayOfInterval({
      start: startOfWeek(monthStart, { weekStartsOn: 1 }),
      end: endOfWeek(monthEnd, { weekStartsOn: 1 }),
    })
  }, [expenseCalendarMonth])

  const appErrors = [
    routinesStore.error,
    incomesStore.error,
    budgetsStore.error,
    commitmentsStore.error,
    creditCardsStore.error,
    expensesStore.error,
    commissionsStore.error,
    commissionTemplatesStore.error,
    payUploadsStore.error,
  ].filter(Boolean)

  const activeTabTitle = useMemo(() => {
    switch (activeTab) {
      case 'overview':
        return 'Overview'
      case 'routine':
        return 'Routine'
      case 'datahub':
        return 'Data Hub'
      case 'income':
        return 'Income Ledger'
      case 'budgeting':
        return 'Budgeting'
      case 'settings':
        return 'Settings'
      default:
        return 'ZenoBudget'
    }
  }, [activeTab])

  if (!isFirebaseConfigured) {
    return (
      <div className="auth-wrap">
        <section className="auth-card">
          <h1>Firebase Setup Required</h1>
          <p>
            Fill all Firebase keys in your .env file and restart the app. This app now uses
            authenticated sessions and account-level Firestore data.
          </p>
        </section>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="auth-wrap">
        <section className="auth-card">
          <p className="chip">ZenoBudget Auth</p>
          <h1>{authMode === 'login' ? 'Welcome Back' : 'Create Your Account'}</h1>
          <p>Secure session login with account-scoped financial data.</p>
          <form
            className="stack-form"
            onSubmit={(event) => {
              event.preventDefault()
              setAuthError(null)
              setAuthInfo(null)

              const action = authMode === 'login' ? signInWithEmail : signUpWithEmail
              void action(email, password)
                .then(() => {
                  if (authMode === 'signup') {
                    setAuthInfo('Verification email sent. Please verify your email before using the dashboard.')
                  }
                })
                .catch((error: Error) => {
                  setAuthError(error.message)
                })
            }}
          >
            {authMode === 'signup' && (
              <label>
                Display Name
                <input
                  type="text"
                  value={displayNameInput}
                  onChange={(event) => setDisplayNameInput(event.target.value)}
                  required
                />
              </label>
            )}
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={6}
                required
              />
            </label>
            {authError && <p className="error-text">{authError}</p>}
            {authInfo && <p className="success-text">{authInfo}</p>}
            <button type="submit" className="primary-btn">
              {authMode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => {
              setAuthError(null)
              setAuthInfo(null)
              void sendResetPasswordEmail(email)
                .then(() => {
                  setAuthInfo('Password reset email sent. Check your inbox.')
                })
                .catch((error: Error) => {
                  setAuthError(error.message)
                })
            }}
            disabled={!email}
          >
            Forgot password
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => {
              setAuthMode((previous) => (previous === 'login' ? 'signup' : 'login'))
              setAuthError(null)
              setAuthInfo(null)
            }}
          >
            {authMode === 'login' ? 'Need a new account? Sign up' : 'Already have an account? Sign in'}
          </button>
        </section>
      </div>
    )
  }

  if (!user.emailVerified) {
    return (
      <div className="auth-wrap">
        <section className="auth-card">
          <p className="chip">Email Verification</p>
          <h1>Verify Your Email</h1>
          <p>
            For security, your account must verify email before dashboard access.
          </p>
          <p>{user.email}</p>
          {verificationInfo && <p className="success-text">{verificationInfo}</p>}
          <div className="split-row">
            <button
              type="button"
              className="primary-btn"
              onClick={() => {
                setVerificationInfo(null)
                void sendCurrentUserVerificationEmail()
                  .then(() => setVerificationInfo('Verification email sent again.'))
                  .catch((error: Error) => setVerificationInfo(error.message))
              }}
            >
              Resend Verification Email
            </button>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => {
                void refreshCurrentUser()
                  .then(() => setVerificationInfo('Status refreshed. If verified, dashboard will unlock.'))
                  .catch((error: Error) => setVerificationInfo(error.message))
              }}
            >
              I Have Verified
            </button>
            <button type="button" className="secondary-btn" onClick={() => void signOutCurrentUser()}>
              <LogOut size={14} />
              Sign Out
            </button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="navbar desktop-navbar">
        <div className="navbar-brand">
          <PiggyBank size={20} />
          <span>ZenoBudget</span>
        </div>
        <nav className="navbar-nav" aria-label="Dashboard sections">
          <button type="button" className={activeTab === 'overview' ? 'active' : ''} onClick={() => navigateToTab('overview')}>
            <Wallet size={15} />
            Overview
          </button>
          <button type="button" className={activeTab === 'routine' ? 'active' : ''} onClick={() => navigateToTab('routine')}>
            <CalendarRange size={15} />
            Routine
          </button>
          <button type="button" className={activeTab === 'datahub' ? 'active' : ''} onClick={() => navigateToTab('datahub')}>
            <Database size={15} />
            Data Hub
          </button>
          <button type="button" className={activeTab === 'income' ? 'active' : ''} onClick={() => navigateToTab('income')}>
            <Coins size={15} />
            Income Ledger
          </button>
          <button type="button" className={activeTab === 'budgeting' ? 'active' : ''} onClick={() => navigateToTab('budgeting')}>
            <PiggyBank size={15} />
            Budgeting
          </button>
          <button type="button" className={activeTab === 'settings' ? 'active' : ''} onClick={() => navigateToTab('settings')}>
            <Settings size={15} />
            Settings
          </button>
        </nav>
        <div className="navbar-user">
          <span className="user-chip">
            <UserRound size={14} />
            {profileStore.profile?.displayName || user.email}
          </span>
          <button type="button" className="ghost-btn" title="Sign out" onClick={() => void signOutCurrentUser()}>
            <LogOut size={14} />
          </button>
        </div>
      </header>

      <header className="mobile-topbar">
        <div className="mobile-topbar-title-wrap">
          <p className="chip">ZenoBudget</p>
          <h1>{activeTabTitle}</h1>
        </div>
        <div className="mobile-topbar-actions">
          <span className="mobile-profile-chip" title={profileStore.profile?.displayName || user.email || ''}>
            <UserRound size={14} />
            {(profileStore.profile?.displayName || user.email || 'Account').slice(0, 14)}
          </span>
          <button type="button" className="ghost-btn" title="Sign out" onClick={() => void signOutCurrentUser()}>
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {loadingAny ? (
        <section className="card">Loading your account data...</section>
      ) : (
        <main className="dashboard-grid">
          {activeTab === 'overview' && (
            <>
              <section className="page-hero overview-hero">
                <div>
                  <h1>Overview</h1>
                  <p>Income Ledger + Budget Control Center · {format(currentMonth, 'MMMM yyyy')}</p>
                </div>
              </section>

              <section className="card span-3 overview-metric-grid">
                <article className="overview-metric-tile">
                  <span>Monthly Income</span>
                  <strong>{formatMoney(monthIncome, currency)}</strong>
                  <small>{overviewIncomeSummary.entryCount} ledger entries</small>
                </article>
                <article className="overview-metric-tile">
                  <span>Monthly Expenses</span>
                  <strong>{formatMoney(monthExpenses, currency)}</strong>
                  <small>{formatMoney(monthBudgetLimit, currency)} planned budget</small>
                </article>
                <article className="overview-metric-tile">
                  <span>Budget Remaining</span>
                  <strong className={monthBudgetLimit - monthExpenses >= 0 ? 'cc-available' : 'cc-util-danger'}>
                    {formatMoney(monthBudgetLimit - monthExpenses, currency)}
                  </strong>
                  <small>
                    {monthBudgetLimit > 0
                      ? `${((monthExpenses / monthBudgetLimit) * 100).toFixed(1)}% of monthly budget used`
                      : 'No monthly budget limits set'}
                  </small>
                </article>
                <article className="overview-metric-tile">
                  <span>Net Monthly Position</span>
                  <strong className={monthIncome - monthExpenses >= 0 ? 'cc-available' : 'cc-util-danger'}>
                    {formatMoney(monthIncome - monthExpenses, currency)}
                  </strong>
                  <small>{formatMoney(ledgerFilteredTotal, currency)} shown in current ledger filter</small>
                </article>
              </section>

              <section className="card span-2">
                <div className="card-heading">
                  <h2>Income vs Expenses Trend</h2>
                  <p>Rolling six-month financial movement</p>
                </div>
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="label" />
                      <YAxis />
                      <Tooltip
                        formatter={(value) =>
                          formatMoney(typeof value === 'number' ? value : Number(value ?? 0), currency)
                        }
                      />
                      <Legend />
                      <Bar dataKey="income" fill="#0f766e" radius={6} />
                      <Bar dataKey="expenses" fill="#ea580c" radius={6} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="card">
                <div className="card-heading">
                  <h2>Income Composition</h2>
                  <p>Commission vs manual income split</p>
                </div>
                <div className="overview-mini-chart">
                  {overviewIncomeTypeChart.length === 0 ? (
                    <p>No income data yet.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={230}>
                      <PieChart>
                        <Pie data={overviewIncomeTypeChart} dataKey="value" nameKey="name" outerRadius={78} innerRadius={44}>
                          {overviewIncomeTypeChart.map((segment) => (
                            <Cell key={segment.name} fill={segment.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => formatMoney(Number(value ?? 0), currency)} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="overview-fact-list">
                  <p>Commission Income: <strong>{formatMoney(overviewIncomeSummary.commissionTotal, currency)}</strong></p>
                  <p>Manual Income: <strong>{formatMoney(overviewIncomeSummary.manualTotal, currency)}</strong></p>
                  <p>Average Entry Value: <strong>{formatMoney(overviewIncomeSummary.averageEntry, currency)}</strong></p>
                </div>
              </section>

              <section className="card span-3">
                <div className="card-heading">
                  <h2>Budget Health by Category</h2>
                  <p>
                    {overviewBudgetSummary.categories} categories · {overviewBudgetSummary.overspent} over limit · 
                    {overviewBudgetSummary.utilizationRate.toFixed(1)}% total utilization
                  </p>
                </div>
                <div className="overview-budget-topline">
                  <div>
                    <span>Total Budgeted</span>
                    <strong>{formatMoney(overviewBudgetSummary.limit, currency)}</strong>
                  </div>
                  <div>
                    <span>Total Spent</span>
                    <strong>{formatMoney(overviewBudgetSummary.spent, currency)}</strong>
                  </div>
                  <div>
                    <span>Remaining</span>
                    <strong className={overviewBudgetSummary.remaining >= 0 ? 'cc-available' : 'cc-util-danger'}>
                      {formatMoney(overviewBudgetSummary.remaining, currency)}
                    </strong>
                  </div>
                </div>
                <div className="category-list">
                  {expensesByCategory.length === 0 && <p>No category data yet.</p>}
                  {expensesByCategory.map((item) => {
                    const ratio = item.monthlyLimit > 0 ? (item.spent / item.monthlyLimit) * 100 : 0
                    return (
                      <article key={item.id} className="category-item">
                        <header>
                          <span className="dot" style={{ backgroundColor: normalizeHexColor(item.color, '#f97316') }} />
                          <strong>{item.category}</strong>
                        </header>
                        <p>
                          {formatMoney(item.spent, currency)} / {formatMoney(item.monthlyLimit, currency)} · {ratio.toFixed(1)}%
                        </p>
                        <div className="progress-track">
                          <div
                            className="progress-fill"
                            style={{
                              width: `${Math.min(ratio, 100)}%`,
                              backgroundColor: normalizeHexColor(item.color, '#f97316'),
                            }}
                          />
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>

              <section className="card span-2">
                <div className="card-heading">
                  <h2>Income Ledger Breakdown</h2>
                  <p>Top commission categories + source quality</p>
                </div>
                <div className="overview-list-grid">
                  {overviewIncomeByCategory.length === 0 && <p>No commission category totals yet.</p>}
                  {overviewIncomeByCategory.map((item) => (
                    <article key={item.name} className="overview-list-item">
                      <span>{item.name}</span>
                      <strong>{formatMoney(item.amount, currency)}</strong>
                    </article>
                  ))}
                </div>
                <div className="overview-fact-list">
                  <p>Commission Entries: <strong>{overviewIncomeSummary.commissionCount}</strong></p>
                  <p>Manual Entries: <strong>{overviewIncomeSummary.manualCount}</strong></p>
                  <p>Visible Group Buckets: <strong>{ledgerGroupedEntries.length}</strong></p>
                </div>
              </section>

              <section className="card">
                <div className="card-heading">
                  <h2>Obligations & Credit Exposure</h2>
                  <p>Loans/subscriptions impact + card utilization</p>
                </div>
                <div className="overview-fact-list">
                  <p>Total Outgoing Commitments: <strong>{formatMoney(initialCommitmentSummary.payments, currency)}</strong></p>
                  <p>Total Incoming Commitments: <strong>{formatMoney(initialCommitmentSummary.collections, currency)}</strong></p>
                  <p>Credit Utilization: <strong>{creditCardSummary.utilizationRate.toFixed(1)}%</strong></p>
                  <p>Linked Subscriptions on Cards: <strong>{formatMoney(creditCardSummary.subscriptionUsage, currency)}</strong></p>
                </div>
                <div className="overview-list-grid">
                  {overviewCommitmentByType.length === 0 && <p>No obligations saved yet.</p>}
                  {overviewCommitmentByType.map((item) => (
                    <article key={item.label} className="overview-list-item">
                      <span>{item.label}</span>
                      <strong>{formatMoney(item.amount, currency)}</strong>
                    </article>
                  ))}
                </div>
              </section>

              <section className="card span-3">
                <div className="card-heading">
                  <h2>Upcoming Monthly Due Dates</h2>
                  <p>Commitments, card payments, and card interest charge days</p>
                </div>
                <div className="overview-timeline">
                  {overviewUpcomingDates.length === 0 && <p>No due dates added yet.</p>}
                  {overviewUpcomingDates.map((item, index) => (
                    <article key={`${item.type}-${item.label}-${index}`} className="overview-timeline-item">
                      <div className={`overview-date-badge ${item.type}`}>
                        Day {item.day}
                      </div>
                      <div>
                        <strong>{item.label}</strong>
                        <p>
                          {item.type === 'commitment'
                            ? 'Obligation due'
                            : item.type === 'card-due'
                              ? 'Credit card payment due'
                              : 'Credit card interest charged'}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="card span-3">
                <div className="card-heading">
                  <h2>Cashflow Direction Line</h2>
                  <p>Income minus expenses trend by month</p>
                </div>
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart
                      data={chartData.map((item) => ({
                        ...item,
                        net: item.income - item.expenses,
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="label" />
                      <YAxis />
                      <Tooltip formatter={(value) => formatMoney(Number(value ?? 0), currency)} />
                      <Legend />
                      <Line type="monotone" dataKey="net" stroke="#1d4ed8" strokeWidth={3} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="card">
                <div className="card-heading">
                  <h2>Active Commission Categories</h2>
                  <p>{commissionsStore.data.filter((item) => item.active).length} active category(ies)</p>
                </div>
              </section>

              <section className="card">
                <div className="card-heading">
                  <h2>Routine Load Today</h2>
                  <p>{routineCountByDate[todayIso] ?? 0} tasks planned</p>
                </div>
                {appErrors.length > 0 && <p className="error-text">{appErrors[0]}</p>}
              </section>
            </>
          )}

          {activeTab === 'routine' && (
            <>
              <section className="page-hero">
                <div>
                  <h1>Daily Routine</h1>
                  <p>Manage your schedule and track task completion</p>
                </div>
              </section>
              <section className="card span-2">
                <div className="card-heading row-between">
                  <div>
                    <h2>Daily Routine Calendar</h2>
                    <p>Click date cells to view and edit schedule items</p>
                  </div>
                  <div className="month-nav">
                    <button type="button" onClick={() => setCurrentMonth((month) => subMonths(month, 1))}>Prev</button>
                    <strong>{format(currentMonth, 'MMMM yyyy')}</strong>
                    <button type="button" onClick={() => setCurrentMonth((month) => addMonths(month, 1))}>Next</button>
                  </div>
                </div>
                <div className="calendar-grid weekday-row">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
                    <div key={label} className="weekday-cell">{label}</div>
                  ))}
                </div>
                <div className="calendar-grid">
                  {calendarDays.map((day) => {
                    const iso = format(day, 'yyyy-MM-dd')
                    const selected = selectedRoutineDate === iso
                    const count = routineCountByDate[iso] ?? 0
                    return (
                      <button
                        key={iso}
                        type="button"
                        className={`day-cell ${!isSameMonth(day, currentMonth) ? 'muted' : ''} ${selected ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedRoutineDate(iso)
                          setRoutineDraft((previous) => ({ ...previous, date: iso }))
                        }}
                      >
                        <span>{format(day, 'd')}</span>
                        {count > 0 && <small>{count} task(s)</small>}
                        {isSameDay(day, new Date()) && <em>Today</em>}
                      </button>
                    )
                  })}
                </div>
              </section>

              <section className="card">
                <div className="card-heading">
                  <h2>{routineDraft.id ? 'Edit Routine Item' : 'Add Routine Item'}</h2>
                </div>
                <form
                  className="stack-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void routinesStore.upsert({ ...routineDraft, date: routineDraft.date || selectedRoutineDate })
                    setRoutineDraft({ ...emptyRoutine(), date: selectedRoutineDate })
                  }}
                >
                  <label>
                    Date
                    <input type="date" value={routineDraft.date} onChange={(event) => setRoutineDraft((previous) => ({ ...previous, date: event.target.value }))} required />
                  </label>
                  <label>
                    Title
                    <input type="text" value={routineDraft.title} onChange={(event) => setRoutineDraft((previous) => ({ ...previous, title: event.target.value }))} required />
                  </label>
                  <div className="row-inputs">
                    <label>
                      Start
                      <input type="time" value={routineDraft.startTime} onChange={(event) => setRoutineDraft((previous) => ({ ...previous, startTime: event.target.value }))} />
                    </label>
                    <label>
                      End
                      <input type="time" value={routineDraft.endTime} onChange={(event) => setRoutineDraft((previous) => ({ ...previous, endTime: event.target.value }))} />
                    </label>
                  </div>
                  <label>
                    Notes
                    <textarea value={routineDraft.notes} onChange={(event) => setRoutineDraft((previous) => ({ ...previous, notes: event.target.value }))} />
                  </label>
                  <label className="checkbox-label">
                    <input type="checkbox" checked={routineDraft.completed} onChange={(event) => setRoutineDraft((previous) => ({ ...previous, completed: event.target.checked }))} />
                    Mark as completed
                  </label>
                  <button type="submit" className="primary-btn">
                    <Plus size={16} />
                    {routineDraft.id ? 'Save Changes' : 'Add Task'}
                  </button>
                </form>
              </section>

              <section className="card span-2">
                <div className="card-heading">
                  <h2>Tasks for {selectedRoutineDate}</h2>
                </div>
                {selectedDateRoutines.length === 0 && <p>No tasks for this date yet.</p>}
                <div className="data-list">
                  {selectedDateRoutines.map((item) => (
                    <article key={item.id} className="data-row">
                      <div>
                        <strong>{item.title}</strong>
                        <p>{item.startTime} - {item.endTime} {item.completed ? '(Done)' : '(Pending)'}</p>
                        {item.notes && <small>{item.notes}</small>}
                      </div>
                      <div className="row-actions">
                        <button type="button" onClick={() => setRoutineDraft(item)} className="ghost-btn">
                          <Pencil size={14} />
                        </button>
                        <button type="button" onClick={() => void routinesStore.remove(item.id)} className="ghost-btn danger">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </>
          )}

          {activeTab === 'datahub' && (
            <>
              <section className="page-hero">
                <div>
                  <h1>Data Hub</h1>
                  <p>Guided day-by-day income upload with review and next-day flow</p>
                </div>
                <div className="stat-row">
                  <div className="stat-pill">
                    <span>Selected day total</span>
                    <strong>{formatMoney(hubSelectedDayEntriesTotal, currency)}</strong>
                  </div>
                  <div className="stat-pill">
                    <span>Missing days since account creation</span>
                    <strong>{hubMissingDaysCount}</strong>
                  </div>
                </div>
              </section>

              <section className="card span-3">
                <div className="card-heading">
                  <h2>Date Flow</h2>
                  <p>Select the day and mark it as working day or day off</p>
                </div>
                <p className="cat-rate-hint">
                  Account created on {accountCreationIso}. After this date, every day must be marked as
                  working day or day off with no skipped dates. You can still upload historical records before
                  account creation.
                </p>
                <div className="date-flow-grid single">
                  <div className="date-nav-group">
                    <span className="field-label">Selected Date</span>
                    <div className="date-nav-controls selected-date-controls">
                      <button
                        type="button"
                        className="ghost-btn"
                        aria-label="Previous selected date"
                        onClick={() => {
                          setHubSelectedDate((previous) => shiftIsoDate(previous, -1))
                          setHubShowReview(false)
                          setHubCalendarOpen(false)
                        }}
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <div className="selected-date-popover" ref={hubCalendarRef}>
                        <button
                          type="button"
                          className="selected-date-picker"
                          aria-label="Open selected date calendar"
                          aria-haspopup="dialog"
                          aria-expanded={hubCalendarOpen}
                          onClick={() => setHubCalendarOpen((previous) => !previous)}
                        >
                          <span className="selected-date-text">{format(parseISO(hubSelectedDate), 'MM/dd/yyyy')}</span>
                          <span className="selected-date-weekday">{format(parseISO(hubSelectedDate), 'EEEE')}</span>
                          <CalendarRange size={15} aria-hidden="true" />
                        </button>
                        {hubCalendarOpen && (
                          <div className="hub-calendar-popover" role="dialog" aria-label="Select date">
                            <div className="hub-calendar-header">
                              <button
                                type="button"
                                className="ghost-btn"
                                aria-label="Previous month"
                                onClick={() => setHubCalendarMonth((previous) => subMonths(previous, 1))}
                              >
                                <ChevronLeft size={14} />
                              </button>
                              <strong>{format(hubCalendarMonth, 'MMMM yyyy')}</strong>
                              <button
                                type="button"
                                className="ghost-btn"
                                aria-label="Next month"
                                onClick={() => setHubCalendarMonth((previous) => addMonths(previous, 1))}
                              >
                                <ChevronRight size={14} />
                              </button>
                            </div>

                            <div className="hub-calendar-grid hub-calendar-weekdays">
                              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
                                <div key={label} className="hub-weekday-cell">
                                  {label}
                                </div>
                              ))}
                            </div>

                            <div className="hub-calendar-grid">
                              {hubCalendarDays.map((day) => {
                                const iso = format(day, 'yyyy-MM-dd')
                                const isSelected = iso === hubSelectedDate

                                return (
                                  <button
                                    key={iso}
                                    type="button"
                                    className={`hub-calendar-day ${!isSameMonth(day, hubCalendarMonth) ? 'muted' : ''} ${isSelected ? 'selected' : ''}`}
                                    onClick={() => {
                                      setHubSelectedDate(iso)
                                      setHubShowReview(false)
                                      setHubCalendarOpen(false)
                                    }}
                                  >
                                    <span>{format(day, 'd')}</span>
                                    {isSameDay(day, new Date()) && <em>Today</em>}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="ghost-btn"
                        aria-label="Next selected date"
                        onClick={() => {
                          setHubSelectedDate((previous) => shiftIsoDate(previous, 1))
                          setHubShowReview(false)
                          setHubCalendarOpen(false)
                        }}
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>

                {hubIsLockedByPayUpload && (
                  <p className="notice">
                    This date is locked because it is already included in an uploaded pay range.
                  </p>
                )}
                {hubHasExistingRecords && !hubEditMode ? (
                  <>
                    <div className="card-heading row-between">
                      <div>
                        <h2>Selected Day Records</h2>
                        <p>{hubSelectedDate} · {hubSelectedDayEntries.length} existing entry(ies)</p>
                      </div>
                      <strong>{formatMoney(hubSelectedDayEntriesTotal, currency)}</strong>
                    </div>
                    <table className="hub-table">
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Category</th>
                          <th>Units</th>
                          <th>Sales</th>
                          <th>Amount</th>
                          <th>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hubSelectedDayEntries.map((item) => {
                          const categoryName =
                            commissionsStore.data.find((category) => category.id === item.commissionCategoryId)
                              ?.name ?? '—'

                          return (
                            <tr key={item.id}>
                              <td>{item.type === 'commission' ? 'Commission' : 'Manual'}</td>
                              <td>{item.type === 'commission' ? categoryName : '—'}</td>
                              <td>{item.type === 'commission' ? safeNumber(item.unitsSold) : '—'}</td>
                              <td>
                                {item.type === 'commission'
                                  ? formatMoney(safeNumber(item.salesAmount), currency)
                                  : '—'}
                              </td>
                              <td>
                                {formatMoney(
                                  calculateIncomeTotal(item, profileStore.profile, commissionsStore.data),
                                  currency,
                                )}
                              </td>
                              <td>{item.notes || '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    <div className="split-row">
                      <button
                        type="button"
                        className="primary-btn"
                        disabled={hubIsLockedByPayUpload}
                        onClick={loadSelectedDayIntoHubDraft}
                      >
                        <Pencil size={14} />
                        Edit This Day
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <label>
                      Day Type
                      <select
                        value={hubDayMode}
                        onChange={(event) => {
                          setHubDayMode(event.target.value as HubDayMode)
                          setHubShowReview(false)
                        }}
                      >
                        <option value="working">Working day</option>
                        <option value="off">Day off</option>
                      </select>
                    </label>

                    {hubDayMode === 'working' && (
                      <>
                        <div className="row-inputs">
                          <label>
                            Hours worked
                            <input
                              type="number"
                              min="0"
                              step="0.25"
                              value={inputNumberValue(hubHoursWorked)}
                              onChange={(event) => {
                                setHubHoursWorked(parseNumberInput(event.target.value))
                                setHubShowReview(false)
                              }}
                            />
                          </label>
                          <label>
                            Hourly Rate Override
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={hubHourlyRateOverride ?? ''}
                              placeholder={`Default: ${profileStore.profile?.defaultHourlyIncome ?? 0}`}
                              onChange={(event) => {
                                setHubHourlyRateOverride(event.target.value === '' ? null : Number(event.target.value))
                                setHubShowReview(false)
                              }}
                            />
                          </label>
                        </div>

                        <div className="hub-table-wrap">
                          <table className="hub-table">
                            <thead>
                              <tr>
                                <th>Commission Category</th>
                                <th>Commission Input</th>
                                <th>Notes</th>
                                <th />
                              </tr>
                            </thead>
                            <tbody>
                              {hubRows.map((row) => (
                                <tr key={row.id}>
                                  <td>
                                    <select
                                      value={row.commissionCategoryId}
                                      onChange={(event) => {
                                        const selectedCategory = commissionsStore.data.find(
                                          (item) => item.id === event.target.value,
                                        )

                                        setHubRows((previous) =>
                                          previous.map((item) => {
                                            if (item.id !== row.id) {
                                              return item
                                            }

                                            if (!selectedCategory) {
                                              return {
                                                ...item,
                                                commissionCategoryId: '',
                                                unitsSold: 0,
                                                salesAmount: 0,
                                              }
                                            }

                                            return {
                                              ...item,
                                              commissionCategoryId: selectedCategory.id,
                                              unitsSold:
                                                selectedCategory.valueType === 'tiered-per-item'
                                                  ? item.unitsSold
                                                  : 0,
                                              salesAmount:
                                                selectedCategory.valueType === 'percentage'
                                                  ? item.salesAmount
                                                  : 0,
                                            }
                                          }),
                                        )
                                        setHubShowReview(false)
                                      }}
                                    >
                                      <option value="">Select category</option>
                                      {commissionsStore.data.filter((item) => item.active).map((category) => (
                                        <option key={category.id} value={category.id}>{category.name}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td>
                                    {(() => {
                                      const selectedCategory = commissionsStore.data.find(
                                        (item) => item.id === row.commissionCategoryId,
                                      )

                                      if (!selectedCategory) {
                                        return <span className="cat-rate-hint">Select a category first</span>
                                      }

                                      if (selectedCategory.valueType === 'percentage') {
                                        return (
                                          <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={inputNumberValue(row.salesAmount)}
                                            placeholder="Sales amount"
                                            onChange={(event) => {
                                              setHubRows((previous) =>
                                                previous.map((item) =>
                                                  item.id === row.id
                                                    ? {
                                                        ...item,
                                                        salesAmount: parseNumberInput(event.target.value),
                                                        unitsSold: 0,
                                                      }
                                                    : item,
                                                ),
                                              )
                                              setHubShowReview(false)
                                            }}
                                          />
                                        )
                                      }

                                      if (selectedCategory.valueType === 'tiered-per-item') {
                                        return (
                                          <input
                                            type="number"
                                            min="0"
                                            step="1"
                                            value={inputNumberValue(row.unitsSold)}
                                            placeholder="Units sold"
                                            onChange={(event) => {
                                              setHubRows((previous) =>
                                                previous.map((item) =>
                                                  item.id === row.id
                                                    ? {
                                                        ...item,
                                                        unitsSold: parseNumberInput(event.target.value),
                                                        salesAmount: 0,
                                                      }
                                                    : item,
                                                ),
                                              )
                                              setHubShowReview(false)
                                            }}
                                          />
                                        )
                                      }

                                      return (
                                        <span className="cat-rate-hint">
                                          Fixed commission applied from category rate
                                        </span>
                                      )
                                    })()}
                                  </td>
                                  <td>
                                    <input
                                      type="text"
                                      value={row.notes}
                                      onChange={(event) => {
                                        setHubRows((previous) =>
                                          previous.map((item) =>
                                            item.id === row.id
                                              ? { ...item, notes: event.target.value }
                                              : item,
                                          ),
                                        )
                                      }}
                                      placeholder="Optional"
                                    />
                                  </td>
                                  <td>
                                    <button
                                      type="button"
                                      className="ghost-btn danger"
                                      onClick={() => {
                                        setHubRows((previous) => {
                                          if (previous.length === 1) {
                                            return [makeHubCommissionRow()]
                                          }

                                          return previous.filter((item) => item.id !== row.id)
                                        })
                                        setHubShowReview(false)
                                      }}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() => setHubRows((previous) => [...previous, makeHubCommissionRow()])}
                          >
                            <Plus size={14} />
                            Add Commission Row
                          </button>
                        </div>
                      </>
                    )}

                    <label>
                      Day Notes
                      <textarea
                        value={hubGeneralNotes}
                        onChange={(event) => setHubGeneralNotes(event.target.value)}
                        placeholder="Optional note for this day"
                      />
                    </label>

                    <div className="split-row">
                      <button
                        type="button"
                        className="primary-btn"
                        onClick={() => {
                          setHubError(null)

                          if (hubIsLockedByPayUpload) {
                            setHubError(
                              'This date is part of an uploaded pay range. Edit from Income Ledger reconciliation instead.',
                            )
                            return
                          }

                          if (firstMissingBeforeSelectedPostCreation) {
                            setHubError(
                              `Cannot skip dates after account creation. Complete ${firstMissingBeforeSelectedPostCreation} first.`,
                            )
                            setHubSelectedDate(firstMissingBeforeSelectedPostCreation)
                            setHubShowReview(false)
                            return
                          }

                          if (!hubSelectedDate) {
                            setHubError('Please select a day before review.')
                            return
                          }

                          if (hubDayMode === 'working' && safeNumber(hubHoursWorked) <= 0 && hubValidRows.length === 0) {
                            setHubError('Add hours worked or at least one commission row before review.')
                            return
                          }

                          setHubShowReview(true)
                        }}
                      >
                        Review Day
                      </button>
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => {
                          setHubShowReview(false)
                          setHubEditMode(false)
                          setHubRows([makeHubCommissionRow()])
                          setHubHoursWorked(8)
                          setHubHourlyRateOverride(null)
                          setHubGeneralNotes('')
                          setHubError(null)
                        }}
                      >
                        Reset Draft
                      </button>
                    </div>
                  </>
                )}
                {hubError && <p className="error-text">{hubError}</p>}
                {hubInfo && <p className="success-text">{hubInfo}</p>}
              </section>

              {hubShowReview && (!hubHasExistingRecords || hubEditMode) && (
                <section className="card span-3">
                  <div className="card-heading">
                    <h2>Review and Save</h2>
                    <p>Verify totals, then save. The next day will be selected automatically.</p>
                  </div>
                  <div className="hub-review-grid">
                    <article>
                      <span>Day Type</span>
                      <strong>{hubDayMode === 'working' ? 'Working day' : 'Day off'}</strong>
                    </article>
                    <article>
                      <span>Hourly Total</span>
                      <strong>{formatMoney(hubHourlyTotal, currency)}</strong>
                    </article>
                    <article>
                      <span>Commissions Total</span>
                      <strong>{formatMoney(hubCommissionsTotal, currency)}</strong>
                    </article>
                    <article>
                      <span>Day Total</span>
                      <strong>{formatMoney(hubDayTotal, currency)}</strong>
                    </article>
                  </div>

                  <div className="hub-table-wrap">
                    <h3>Hourly Breakdown</h3>
                    {hubDayMode === 'off' ? (
                      <p className="cat-rate-hint">Day marked as off. Hourly and commission amounts will be zero.</p>
                    ) : (
                      <table className="hub-table">
                        <thead>
                          <tr>
                            <th>Hours</th>
                            <th>Rate</th>
                            <th>Formula</th>
                            <th>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>{safeNumber(hubHoursWorked)}</td>
                            <td>{formatMoney(hubHourlyRate, currency)}</td>
                            <td>
                              {safeNumber(hubHoursWorked)} x {formatMoney(hubHourlyRate, currency)}
                            </td>
                            <td>{formatMoney(hubHourlyTotal, currency)}</td>
                          </tr>
                        </tbody>
                      </table>
                    )}
                  </div>

                  <div className="hub-table-wrap">
                    <h3>Commission Breakdown</h3>
                    {hubDayMode === 'off' || hubCommissionReviewRows.length === 0 ? (
                      <p className="cat-rate-hint">No commission rows to save for this day.</p>
                    ) : (
                      <table className="hub-table">
                        <thead>
                          <tr>
                            <th>Category</th>
                            <th>Type</th>
                            <th>Input</th>
                            <th>Rate/Tier</th>
                            <th>Formula</th>
                            <th>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {hubCommissionReviewRows.map((row) => (
                            <tr key={row.id}>
                              <td>{row.categoryName}</td>
                              <td>
                                {row.valueType === 'tiered-per-item'
                                  ? 'Tiered'
                                  : row.valueType === 'percentage'
                                    ? 'Percentage'
                                    : 'Fixed'}
                              </td>
                              <td>
                                {row.valueType === 'percentage'
                                  ? `Sales: ${formatMoney(row.salesAmount, currency)}`
                                  : row.valueType === 'tiered-per-item'
                                    ? `Units: ${row.unitsSold}`
                                    : 'No input required'}
                              </td>
                              <td>
                                {row.valueType === 'percentage'
                                  ? `${row.rate}%`
                                  : row.valueType === 'tiered-per-item'
                                    ? `>= ${safeNumber(row.tier?.minItems ?? 0)} items @ ${formatMoney(safeNumber(row.tier?.amountPerItem ?? 0), currency)}/item`
                                    : formatMoney(row.rate, currency)}
                              </td>
                              <td>
                                {row.valueType === 'percentage'
                                  ? `${formatMoney(row.salesAmount, currency)} x (${row.rate} / 100)`
                                  : row.valueType === 'tiered-per-item'
                                    ? `${row.unitsSold} x ${formatMoney(safeNumber(row.tier?.amountPerItem ?? 0), currency)}`
                                    : `Fixed ${formatMoney(row.rate, currency)}`}
                              </td>
                              <td>{formatMoney(row.amount, currency)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {hubGeneralNotes.trim() && (
                    <div className="calc-highlight">
                      <strong>Day Notes</strong>
                      <p>{hubGeneralNotes.trim()}</p>
                    </div>
                  )}

                  <div className="split-row">
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() => {
                        if (firstMissingBeforeSelectedPostCreation) {
                          setHubError(
                            `Cannot skip dates after account creation. Complete ${firstMissingBeforeSelectedPostCreation} first.`,
                          )
                          setHubSelectedDate(firstMissingBeforeSelectedPostCreation)
                          setHubShowReview(false)
                          return
                        }

                        if (hubIsLockedByPayUpload) {
                          setHubError(
                            'This date is part of an uploaded pay range. Edit from Income Ledger reconciliation instead.',
                          )
                          setHubShowReview(false)
                          return
                        }

                        const editableEntries = hubSelectedDayEntries.filter(
                          (item) => !item.generatedFromTemplateId,
                        )

                        Promise.all(editableEntries.map((item) => incomesStore.remove(item.id)))
                          .then(async () => {
                            if (hubDayMode === 'off') {
                              await incomesStore.upsert({
                                date: hubSelectedDate,
                                type: 'manual',
                                generatedFromTemplateId: null,
                                generatedForMonth: null,
                                commissionCategoryId: '',
                                commissionValueTypeOverride: null,
                                commissionRateOverride: null,
                                hourlyRateOverride: null,
                                hours: 0,
                                unitsSold: 0,
                                salesAmount: 0,
                                manualAmount: 0,
                                notes: hubGeneralNotes.trim() || 'Data Hub: Day off',
                              })
                            } else {
                              if (hubHourlyTotal > 0) {
                                await incomesStore.upsert({
                                  date: hubSelectedDate,
                                  type: 'manual',
                                  generatedFromTemplateId: null,
                                  generatedForMonth: null,
                                  commissionCategoryId: '',
                                  commissionValueTypeOverride: null,
                                  commissionRateOverride: null,
                                  hourlyRateOverride: null,
                                  hours: 0,
                                  unitsSold: 0,
                                  salesAmount: 0,
                                  manualAmount: hubHourlyTotal,
                                  notes: hubGeneralNotes.trim() || 'Data Hub: Hourly base',
                                })
                              }

                              for (const row of hubValidRows) {
                                await incomesStore.upsert({
                                  date: hubSelectedDate,
                                  type: 'commission',
                                  generatedFromTemplateId: null,
                                  generatedForMonth: null,
                                  commissionCategoryId: row.commissionCategoryId,
                                  commissionValueTypeOverride: null,
                                  commissionRateOverride: null,
                                  hourlyRateOverride: null,
                                  hours: 0,
                                  unitsSold: safeNumber(row.unitsSold),
                                  salesAmount: safeNumber(row.salesAmount),
                                  manualAmount: 0,
                                  notes: row.notes.trim() || 'Data Hub: Commission entry',
                                })
                              }
                            }

                            const nextDay = format(addDays(parseISO(hubSelectedDate), 1), 'yyyy-MM-dd')
                            setHubInfo(`Saved ${hubSelectedDate}. Ready for ${nextDay}.`)
                            setHubShowReview(false)
                            setHubSelectedDate(nextDay)
                            setHubDayMode('working')
                            setHubHoursWorked(8)
                            setHubHourlyRateOverride(null)
                            setHubRows([makeHubCommissionRow()])
                            setHubGeneralNotes('')
                            setHubError(null)
                          })
                          .catch((error: Error) => {
                            setHubError(error.message)
                          })
                      }}
                    >
                      Save and Move to Next Day
                    </button>
                    <button type="button" className="secondary-btn" onClick={() => setHubShowReview(false)}>
                      Edit Before Save
                    </button>
                  </div>
                </section>
              )}

              <section className="card span-3">
                <div className="cc-section-header">
                  <div>
                    <h2>Expense Entries Hub</h2>
                    <p>Log daily expenses with category mapping and keep budgeting synced in real time.</p>
                  </div>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => {
                      if (budgetsStore.data.length === 0) {
                        navigateToTab('budgeting')
                        setShowBudgetForm(true)
                        return
                      }

                      setExpenseDraft({ ...emptyExpense(), date: hubSelectedDate })
                      setExpenseCalendarOpen(false)
                      setShowHubExpenseForm((previous) => !previous)
                    }}
                  >
                    <Receipt size={15} />
                    {showHubExpenseForm ? 'Cancel' : 'Add Expense'}
                  </button>
                </div>

                {budgetsStore.data.length === 0 && (
                  <p className="cat-rate-hint">
                    Add at least one budget category in Budgeting to start logging expense entries here.
                  </p>
                )}

                {showHubExpenseForm && (
                  <form
                    className="stack-form cc-form-panel expense-hub-form"
                    onSubmit={(event) => {
                      event.preventDefault()
                      setHubError(null)
                      void saveExpenseEntry().catch((error: Error) => {
                        setHubError(error.message)
                      })
                    }}
                  >
                    <h3>{expenseDraft.id ? 'Edit Expense Entry' : 'New Expense Entry'}</h3>
                    <div className="row-inputs">
                      <label>
                        <div className="date-flow-grid single expense-date-flow">
                          <div className="date-nav-group">
                            <span className="field-label">Expense Date</span>
                            <div className="date-nav-controls selected-date-controls">
                              <button
                                type="button"
                                className="ghost-btn"
                                aria-label="Previous expense date"
                                onClick={() => {
                                  setExpenseDraft((previous) => ({
                                    ...previous,
                                    date: shiftIsoDate(previous.date || hubSelectedDate, -1),
                                  }))
                                  setExpenseCalendarOpen(false)
                                }}
                              >
                                <ChevronLeft size={14} />
                              </button>
                              <div className="selected-date-popover" ref={expenseCalendarRef}>
                                <button
                                  type="button"
                                  className="selected-date-picker"
                                  aria-label="Open expense date calendar"
                                  aria-haspopup="dialog"
                                  aria-expanded={expenseCalendarOpen}
                                  onClick={() => setExpenseCalendarOpen((previous) => !previous)}
                                >
                                  <span className="selected-date-text">
                                    {format(parseISO(expenseDraft.date || hubSelectedDate), 'MM/dd/yyyy')}
                                  </span>
                                  <span className="selected-date-weekday">
                                    {format(parseISO(expenseDraft.date || hubSelectedDate), 'EEEE')}
                                  </span>
                                  <CalendarRange size={15} aria-hidden="true" />
                                </button>
                                {expenseCalendarOpen && (
                                  <div className="hub-calendar-popover" role="dialog" aria-label="Select expense date">
                                    <div className="hub-calendar-header">
                                      <button
                                        type="button"
                                        className="ghost-btn"
                                        aria-label="Previous month"
                                        onClick={() => setExpenseCalendarMonth((previous) => subMonths(previous, 1))}
                                      >
                                        <ChevronLeft size={14} />
                                      </button>
                                      <strong>{format(expenseCalendarMonth, 'MMMM yyyy')}</strong>
                                      <button
                                        type="button"
                                        className="ghost-btn"
                                        aria-label="Next month"
                                        onClick={() => setExpenseCalendarMonth((previous) => addMonths(previous, 1))}
                                      >
                                        <ChevronRight size={14} />
                                      </button>
                                    </div>
                                    <div className="hub-calendar-grid hub-calendar-weekdays">
                                      {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((day) => (
                                        <span key={day} className="hub-weekday-cell">
                                          {day}
                                        </span>
                                      ))}
                                    </div>
                                    <div className="hub-calendar-grid">
                                      {expenseCalendarDays.map((day) => {
                                        const iso = format(day, 'yyyy-MM-dd')
                                        const isSelected = iso === (expenseDraft.date || hubSelectedDate)
                                        return (
                                          <button
                                            key={iso}
                                            type="button"
                                            className={`hub-calendar-day ${!isSameMonth(day, expenseCalendarMonth) ? 'muted' : ''} ${isSelected ? 'selected' : ''}`}
                                            onClick={() => {
                                              setExpenseDraft((previous) => ({ ...previous, date: iso }))
                                              setExpenseCalendarOpen(false)
                                            }}
                                          >
                                            <span>{format(day, 'd')}</span>
                                            {isSameDay(day, new Date()) && <em>Today</em>}
                                          </button>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                              <button
                                type="button"
                                className="ghost-btn"
                                aria-label="Next expense date"
                                onClick={() => {
                                  setExpenseDraft((previous) => ({
                                    ...previous,
                                    date: shiftIsoDate(previous.date || hubSelectedDate, 1),
                                  }))
                                  setExpenseCalendarOpen(false)
                                }}
                              >
                                <ChevronRight size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="quick-date-row expense-date-shortcuts">
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() =>
                              setExpenseDraft((previous) => ({
                                ...previous,
                                date: shiftIsoDate(previous.date || hubSelectedDate, -1),
                              }))
                            }
                          >
                            Prev Day
                          </button>
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() =>
                              setExpenseDraft((previous) => ({
                                ...previous,
                                date: hubSelectedDate,
                              }))
                            }
                          >
                            Hub Day
                          </button>
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() =>
                              setExpenseDraft((previous) => ({
                                ...previous,
                                date: todayIso,
                              }))
                            }
                          >
                            Today
                          </button>
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() =>
                              setExpenseDraft((previous) => ({
                                ...previous,
                                date: shiftIsoDate(previous.date || hubSelectedDate, 1),
                              }))
                            }
                          >
                            Next Day
                          </button>
                        </div>
                      </label>
                      <label>
                        Category
                        <select
                          value={expenseDraft.categoryId}
                          onChange={(event) =>
                            setExpenseDraft((previous) => ({ ...previous, categoryId: event.target.value }))
                          }
                          required
                        >
                          <option value="">Select category</option>
                          {budgetsStore.data.map((category) => (
                            <option key={category.id} value={category.id}>{category.category}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="row-inputs">
                      <label>
                        Payment Source
                        <select
                          value={expenseDraft.paymentSource ?? 'cash'}
                          onChange={(event) => {
                            const nextPaymentSource = event.target.value as 'cash' | 'credit-card'
                            setExpenseDraft((previous) => ({
                              ...previous,
                              paymentSource: nextPaymentSource,
                              creditCardId:
                                nextPaymentSource === 'credit-card'
                                  ? previous.creditCardId ?? (creditCards[0]?.id ?? null)
                                  : null,
                            }))
                          }}
                        >
                          <option value="cash">Cash / Bank</option>
                          <option value="credit-card">Credit Card</option>
                        </select>
                      </label>

                      {expenseDraft.paymentSource === 'credit-card' && (
                        <label>
                          Credit Card
                          <select
                            value={expenseDraft.creditCardId ?? ''}
                            onChange={(event) =>
                              setExpenseDraft((previous) => ({
                                ...previous,
                                creditCardId: event.target.value || null,
                              }))
                            }
                            required
                          >
                            <option value="">Select card</option>
                            {creditCards.map((card) => (
                              <option key={card.id} value={card.id}>
                                {card.name} ({card.issuer})
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      <label>
                        Amount
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={inputNumberValue(expenseDraft.amount)}
                          onChange={(event) =>
                            setExpenseDraft((previous) => ({
                              ...previous,
                              amount: parseNumberInput(event.target.value),
                            }))
                          }
                          required
                        />
                      </label>
                    </div>

                    {expenseDraft.paymentSource === 'credit-card' && (
                      <div className="cc-summary-bar">
                        <div className="cc-summary-item">
                          <span>Card APR</span>
                          <strong>{safeNumber(selectedExpenseCreditCard?.apr ?? 0).toFixed(2)}%</strong>
                        </div>
                        <div className="cc-summary-item">
                          <span>APR Add-on (month prorated)</span>
                          <strong>{formatMoney(expenseDraftInterestPreview, currency)}</strong>
                        </div>
                        <div className="cc-summary-item">
                          <span>Posted to Card</span>
                          <strong>{formatMoney(expenseDraftCardChargePreview, currency)}</strong>
                        </div>
                      </div>
                    )}

                    <div className="row-inputs">
                      <label>
                        Description
                        <input
                          type="text"
                          value={expenseDraft.description}
                          onChange={(event) =>
                            setExpenseDraft((previous) => ({ ...previous, description: event.target.value }))
                          }
                          placeholder="Groceries, fuel, subscription, etc."
                          required
                        />
                      </label>
                    </div>

                    <label>
                      Notes
                      <textarea
                        value={expenseDraft.notes}
                        onChange={(event) =>
                          setExpenseDraft((previous) => ({ ...previous, notes: event.target.value }))
                        }
                        placeholder="Optional"
                      />
                    </label>

                    <div className="split-row">
                      <button type="submit" className="primary-btn">
                        <Receipt size={15} />
                        {expenseDraft.id ? 'Save Expense' : 'Add Expense'}
                      </button>
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => {
                          setExpenseDraft({ ...emptyExpense(), date: hubSelectedDate })
                          setExpenseCalendarOpen(false)
                          setShowHubExpenseForm(false)
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                <div className="cc-summary-bar">
                  <div className="cc-summary-item">
                    <span>Selected Day Total</span>
                    <strong>{formatMoney(hubExpenseSummary.selectedDayTotal, currency)}</strong>
                  </div>
                  <div className="cc-summary-item">
                    <span>This Month Total</span>
                    <strong>{formatMoney(hubExpenseSummary.monthTotal, currency)}</strong>
                  </div>
                  <div className="cc-summary-item">
                    <span>All Time Total</span>
                    <strong>{formatMoney(hubExpenseSummary.allTimeTotal, currency)}</strong>
                  </div>
                  <div className="cc-summary-item">
                    <span>Visible Entries</span>
                    <strong>{hubExpenseSummary.visibleCount}</strong>
                  </div>
                  <div className="cc-summary-item">
                    <span>Visible Amount</span>
                    <strong>{formatMoney(hubExpenseSummary.visibleTotal, currency)}</strong>
                  </div>
                </div>

                <div className="ledger-controls hub-expense-controls">
                  <input
                    type="search"
                    value={hubExpenseSearch}
                    onChange={(event) => setHubExpenseSearch(event.target.value)}
                    placeholder="Search date, category, description, notes, amount"
                  />
                  <div className="ledger-filter-grid">
                    <label>
                      Category
                      <select
                        value={hubExpenseCategoryFilter}
                        onChange={(event) => setHubExpenseCategoryFilter(event.target.value)}
                      >
                        <option value="all">All categories</option>
                        {budgetsStore.data.map((category) => (
                          <option key={category.id} value={category.id}>{category.category}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Date from
                      <input
                        type="date"
                        value={hubExpenseDateFrom}
                        onChange={(event) => setHubExpenseDateFrom(event.target.value)}
                      />
                    </label>
                    <label>
                      Date to
                      <input
                        type="date"
                        value={hubExpenseDateTo}
                        onChange={(event) => setHubExpenseDateTo(event.target.value)}
                      />
                    </label>
                  </div>
                  <div className="split-row">
                    <p className="cat-rate-hint">
                      {hubExpenseSummary.visibleCount} entries · {formatMoney(hubExpenseSummary.visibleTotal, currency)}
                    </p>
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => {
                        setHubExpenseSearch('')
                        setHubExpenseCategoryFilter('all')
                        setHubExpenseDateFrom('')
                        setHubExpenseDateTo('')
                      }}
                    >
                      Reset Filters
                    </button>
                  </div>
                </div>

                <div className="cc-card-grid">
                  {hubExpenseEntries.length === 0 && (
                    <div className="cc-empty-state">
                      <p>No expense entries match current filters.</p>
                    </div>
                  )}
                  {hubExpenseEntries.map((item) => {
                    const category = budgetsStore.data.find((entry) => entry.id === item.categoryId)
                    return (
                      <div key={item.id} className="cc-card-tile">
                        <div className="cc-card-top">
                          <div className="cc-card-identity">
                            <strong className="cc-card-name">{item.description}</strong>
                            <span className="cc-card-issuer">{category?.category ?? 'Uncategorized'}</span>
                          </div>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="ghost-btn"
                              onClick={() => {
                                setExpenseDraft({
                                  ...item,
                                  paymentSource: item.paymentSource ?? 'cash',
                                  creditCardId: item.creditCardId ?? null,
                                  creditCardInterestAmount: safeNumber(item.creditCardInterestAmount ?? 0),
                                  creditCardChargeTotal: safeNumber(item.creditCardChargeTotal ?? 0),
                                })
                                setExpenseCalendarMonth(parseISO(item.date))
                                setExpenseCalendarOpen(false)
                                setShowHubExpenseForm(true)
                              }}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              type="button"
                              className="ghost-btn danger"
                              onClick={() =>
                                void removeExpenseEntry(item).catch((error: Error) => {
                                  setHubError(error.message)
                                })
                              }
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        <div className="ob-amount-row">
                          <span className="ob-direction-badge ob-outgoing">Expense</span>
                          <strong className="ob-amount cc-util-danger">{formatMoney(safeNumber(item.amount), currency)}</strong>
                        </div>

                        <div className="cc-card-meta">
                          <span>Date <strong>{item.date}</strong></span>
                          <span>Category Limit <strong>{formatMoney(safeNumber(category?.monthlyLimit ?? 0), currency)}</strong></span>
                          <span>
                            Payment
                            <strong>
                              {item.paymentSource === 'credit-card'
                                ? creditCardsStore.data.find((card) => card.id === item.creditCardId)?.name ??
                                  'Credit Card'
                                : 'Cash / Bank'}
                            </strong>
                          </span>
                          {item.paymentSource === 'credit-card' && (
                            <span>
                              Card Charge
                              <strong>{formatMoney(safeNumber(item.creditCardChargeTotal ?? 0), currency)}</strong>
                            </span>
                          )}
                        </div>

                        {item.notes && <p className="cc-card-notes">{item.notes}</p>}
                      </div>
                    )
                  })}
                </div>
              </section>
            </>
          )}

          {activeTab === 'income' && (
            <>
              <section className="page-hero">
                <div>
                  <h1>Income Ledger</h1>
                  <p>Ledger and pay-date reconciliation for estimated vs actual income</p>
                </div>
                <div className="stat-row">
                  <div className="stat-pill">
                    <span>This month income</span>
                    <strong>{formatMoney(monthIncome, currency)}</strong>
                  </div>
                  <div className="stat-pill">
                    <span>All entries</span>
                    <strong>{incomesStore.data.length}</strong>
                  </div>
                </div>
              </section>

              <section className="card span-3">
                <div className="type-toggle">
                  <button
                    type="button"
                    className={incomeScreen === 'ledger' ? 'active' : ''}
                    onClick={() => setIncomeScreen('ledger')}
                  >
                    <Coins size={14} />
                    Day Ledger
                  </button>
                  <button
                    type="button"
                    className={incomeScreen === 'reconciliation' ? 'active' : ''}
                    onClick={() => setIncomeScreen('reconciliation')}
                  >
                    <Wallet size={14} />
                    Pay Reconciliation
                  </button>
                </div>
              </section>

              {incomeScreen === 'reconciliation' && (
                <>
                  <section className="card span-3">
                    <div className="card-heading">
                      <h2>Upload Actual Pay</h2>
                      <p>
                        Add payment date and period range to compare Data Hub estimated income with actual received amount.
                      </p>
                    </div>
                    <form
                      className="stack-form"
                      onSubmit={(event) => {
                        event.preventDefault()
                        setPayUploadError(null)
                        setPayUploadInfo(null)

                        if (payUploadDraft.startDate > payUploadDraft.endDate) {
                          setPayUploadError('Start date cannot be after end date.')
                          return
                        }

                        void payUploadsStore
                          .upsert({
                            startDate: payUploadDraft.startDate,
                            endDate: payUploadDraft.endDate,
                            paymentDate: payUploadDraft.paymentDate,
                            estimatedIncome: estimatedIncomeForPayDraft,
                            actualIncome: safeNumber(payUploadDraft.actualIncome),
                            variance: safeNumber(payUploadDraft.actualIncome) - estimatedIncomeForPayDraft,
                            notes: payUploadDraft.notes,
                          })
                          .then(() => {
                            setPayUploadInfo('Actual pay uploaded and compared successfully.')
                            setPayUploadDraft((previous) => ({
                              ...previous,
                              paymentDate: todayIso,
                              actualIncome: 0,
                              notes: '',
                            }))
                          })
                          .catch((error: Error) => setPayUploadError(error.message))
                      }}
                    >
                      <div className="row-inputs">
                        <label>
                          Period Start Date
                          <input
                            type="date"
                            value={payUploadDraft.startDate}
                            onChange={(event) =>
                              setPayUploadDraft((previous) => ({ ...previous, startDate: event.target.value }))
                            }
                            required
                          />
                        </label>
                        <label>
                          Period End Date
                          <input
                            type="date"
                            value={payUploadDraft.endDate}
                            onChange={(event) =>
                              setPayUploadDraft((previous) => ({ ...previous, endDate: event.target.value }))
                            }
                            required
                          />
                        </label>
                      </div>

                      <div className="row-inputs">
                        <label>
                          Payment Date
                          <input
                            type="date"
                            value={payUploadDraft.paymentDate}
                            onChange={(event) =>
                              setPayUploadDraft((previous) => ({ ...previous, paymentDate: event.target.value }))
                            }
                            required
                          />
                        </label>
                        <label>
                          Actual Income Received
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={inputNumberValue(payUploadDraft.actualIncome)}
                            onChange={(event) =>
                              setPayUploadDraft((previous) => ({
                                ...previous,
                                actualIncome: parseNumberInput(event.target.value),
                              }))
                            }
                            required
                          />
                        </label>
                      </div>

                      <label>
                        Notes
                        <input
                          type="text"
                          value={payUploadDraft.notes}
                          onChange={(event) =>
                            setPayUploadDraft((previous) => ({ ...previous, notes: event.target.value }))
                          }
                          placeholder="Optional note for this pay upload"
                        />
                      </label>

                      <div className="hub-review-grid">
                        <article>
                          <span>Estimated from Data Hub</span>
                          <strong>{formatMoney(estimatedIncomeForPayDraft, currency)}</strong>
                        </article>
                        <article>
                          <span>Actual entered</span>
                          <strong>{formatMoney(safeNumber(payUploadDraft.actualIncome), currency)}</strong>
                        </article>
                        <article>
                          <span>Variance</span>
                          <strong>{formatMoney(payDraftVariance, currency)}</strong>
                        </article>
                        <article>
                          <span>Configured cycle</span>
                          <strong>{payUploadFrequency === 'monthly' ? 'Monthly' : 'Every 2 weeks'}</strong>
                        </article>
                      </div>

                      <button type="submit" className="primary-btn">
                        <Wallet size={16} />
                        Upload and Compare Pay
                      </button>
                      {payUploadError && <p className="error-text">{payUploadError}</p>}
                      {payUploadInfo && <p className="success-text">{payUploadInfo}</p>}
                    </form>
                  </section>

                  <section className="card span-3">
                    <div className="card-heading">
                      <h2>Uploaded Pay History</h2>
                      <p>{payUploadsByPaymentDate.length} upload record(s)</p>
                    </div>
                    {payUploadsByPaymentDate.length === 0 && <p>No pay uploads yet.</p>}
                    <div className="data-list">
                      {payUploadsByPaymentDate.map((item) => (
                        <article key={item.id} className="data-row">
                          <div>
                            <strong>
                              {item.startDate} to {item.endDate} • Paid {item.paymentDate}
                            </strong>
                            <p>
                              Estimated {formatMoney(item.estimatedIncome, currency)} • Actual{' '}
                              {formatMoney(item.actualIncome, currency)} • Variance{' '}
                              {formatMoney(item.variance, currency)}
                            </p>
                            {item.notes && <small>{item.notes}</small>}
                          </div>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="ghost-btn danger"
                              onClick={() => void payUploadsStore.remove(item.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                </>
              )}

              {incomeScreen === 'ledger' && (
                <section className="card span-3">
                  <div className="card-heading">
                    <h2>Income Records</h2>
                    <p>Search, filter, and dynamically group by day, week, biweekly, month, or year</p>
                  </div>

                  <div className="ledger-controls">
                    <input
                      type="search"
                      value={ledgerSearch}
                      onChange={(event) => setLedgerSearch(event.target.value)}
                      placeholder="Search date, category, notes, type, or amount"
                    />

                    <div className="ledger-filter-grid">
                      <label>
                        Group by
                        <select
                          value={ledgerGroupBy}
                          onChange={(event) => setLedgerGroupBy(event.target.value as LedgerGroupBy)}
                        >
                          <option value="day">Day</option>
                          <option value="week">Week</option>
                          <option value="biweekly">Biweekly</option>
                          <option value="month">Month</option>
                          <option value="year">Year</option>
                        </select>
                      </label>

                      <label>
                        Type
                        <select
                          value={ledgerTypeFilter}
                          onChange={(event) => setLedgerTypeFilter(event.target.value as LedgerTypeFilter)}
                        >
                          <option value="all">All</option>
                          <option value="commission">Commission</option>
                          <option value="manual">Manual</option>
                        </select>
                      </label>

                      <label>
                        Commission category
                        <select
                          value={ledgerCategoryFilter}
                          onChange={(event) => setLedgerCategoryFilter(event.target.value)}
                        >
                          <option value="all">All categories</option>
                          {commissionsStore.data.map((category) => (
                            <option key={category.id} value={category.id}>{category.name}</option>
                          ))}
                        </select>
                      </label>

                      <label>
                        Date from
                        <input
                          type="date"
                          value={ledgerDateFrom}
                          onChange={(event) => setLedgerDateFrom(event.target.value)}
                        />
                      </label>

                      <label>
                        Date to
                        <input
                          type="date"
                          value={ledgerDateTo}
                          onChange={(event) => setLedgerDateTo(event.target.value)}
                        />
                      </label>

                      <label>
                        Sort
                        <select
                          value={ledgerSortOrder}
                          onChange={(event) => setLedgerSortOrder(event.target.value as 'desc' | 'asc')}
                        >
                          <option value="desc">Newest first</option>
                          <option value="asc">Oldest first</option>
                        </select>
                      </label>
                    </div>

                    <div className="split-row">
                      <p className="cat-rate-hint">
                        {ledgerFilteredEntries.length} entries in {ledgerGroupedEntries.length}{' '}
                        {ledgerGroupedEntries.length === 1 ? 'group' : 'groups'} · Total{' '}
                        {formatMoney(ledgerFilteredTotal, currency)}
                      </p>
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => {
                          setLedgerSearch('')
                          setLedgerGroupBy('month')
                          setLedgerTypeFilter('all')
                          setLedgerCategoryFilter('all')
                          setLedgerDateFrom('')
                          setLedgerDateTo('')
                          setLedgerSortOrder('desc')
                        }}
                      >
                        Reset Filters
                      </button>
                    </div>
                  </div>

                  {incomesStore.data.length === 0 && (
                    <p>No income entries yet. Open Data Hub to start day-by-day uploads.</p>
                  )}
                  {incomesStore.data.length > 0 && ledgerFilteredEntries.length === 0 && (
                    <p>No records match your current search and filters.</p>
                  )}

                  <div className="income-records">
                    {ledgerGroupedEntries.map((group) => {
                      return (
                        <div key={group.key} className="day-group">
                          <div className="day-group-header">
                            <span className="day-group-date">{group.label}</span>
                            <span className="day-group-meta">
                              {group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'} ·{' '}
                              <strong>{formatMoney(group.total, currency)}</strong>
                            </span>
                          </div>
                          <div className="day-entries">
                            {group.entries.map((entry) => {
                              const item = entry.item
                              const cat = entry.category
                              return (
                                <article key={item.id} className="income-entry-row">
                                  <div
                                    className="income-entry-badge"
                                    style={{
                                      backgroundColor: (cat?.color ?? '#64748b') + '1a',
                                      borderColor: (cat?.color ?? '#64748b') + '55',
                                      color: cat?.color ?? '#64748b',
                                    }}
                                  >
                                    {item.type === 'commission' ? <Coins size={12} /> : <HandCoins size={12} />}
                                    <span>{item.type === 'commission' ? (cat?.name ?? 'Commission') : 'Manual'}</span>
                                  </div>
                                  <div className="income-entry-details">
                                    <span>{item.notes || 'No notes'}</span>
                                    <small>
                                      {format(parseISO(item.date), 'EEE, MMM d, yyyy')} ·{' '}
                                      {item.type === 'commission'
                                        ? cat?.valueType === 'percentage'
                                          ? `Sales ${formatMoney(safeNumber(item.salesAmount), currency)}`
                                          : cat?.valueType === 'tiered-per-item'
                                            ? `${safeNumber(item.unitsSold)} units`
                                            : 'Fixed category rate'
                                        : 'Manual amount'}
                                    </small>
                                  </div>
                                  <div className="income-entry-amount">{formatMoney(entry.entryTotal, currency)}</div>
                                  <div className="row-actions">
                                    <button
                                      type="button"
                                      onClick={() => void incomesStore.remove(item.id)}
                                      className="ghost-btn danger"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </article>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}
            </>
          )}

          {activeTab === 'budgeting' && (
            <>
              <section className="page-hero">
                <div>
                  <h1>Budgeting</h1>
                  <p>Track budget categories and log expense entries</p>
                </div>
              </section>

              <section className="card span-3">
                <div className="cc-section-header">
                  <div>
                    <h2>Loans &amp; Obligations</h2>
                    <p>Track loans, rent, mortgage, receivables, and other recurring obligations with due dates.</p>
                  </div>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => {
                      setCommitmentDraft(emptyBudgetCommitment())
                      setShowCommitmentForm((previous) => !previous)
                    }}
                  >
                    <Plus size={15} />
                    {showCommitmentForm ? 'Cancel' : 'Add Obligation'}
                  </button>
                </div>

                {showCommitmentForm && (
                  <form
                    className="stack-form cc-form-panel"
                    onSubmit={(event) => {
                      event.preventDefault()
                      const selectedTypeMeta = commitmentTypeMeta[commitmentDraft.type]
                      const dueDay =
                        commitmentDraft.dueDay === null
                          ? null
                          : Math.max(1, Math.min(28, safeNumber(commitmentDraft.dueDay, 1)))
                      const linkedCreditCardId =
                        commitmentDraft.type === 'subscription'
                          ? commitmentDraft.linkedCreditCardId
                          : null

                      void commitmentsStore.upsert({
                        ...commitmentDraft,
                        name: commitmentDraft.name.trim(),
                        linkedCreditCardId,
                        direction: selectedTypeMeta.direction,
                        group: selectedTypeMeta.group,
                        currentAmount: safeNumber(commitmentDraft.currentAmount),
                        recurringMonthly: dueDay !== null,
                        dueDay,
                        color: selectedTypeMeta.color,
                      })
                      setCommitmentDraft(emptyBudgetCommitment())
                      setShowCommitmentForm(false)
                    }}
                  >
                    <h3>{commitmentDraft.id ? 'Edit Obligation' : 'New Obligation'}</h3>
                    <div className="row-inputs">
                      <label>
                        Name
                        <input
                          type="text"
                          value={commitmentDraft.name}
                          onChange={(event) =>
                            setCommitmentDraft((previous) => ({ ...previous, name: event.target.value }))
                          }
                          placeholder="Car Loan, Rent, etc."
                          required
                        />
                      </label>
                      <label>
                        Category
                        <select
                          value={commitmentDraft.type}
                          onChange={(event) =>
                            setCommitmentDraft((previous) => {
                              const nextType = event.target.value as BudgetCommitmentType
                              return {
                                ...previous,
                                type: nextType,
                                linkedCreditCardId:
                                  nextType === 'subscription' ? previous.linkedCreditCardId : null,
                              }
                            })
                          }
                        >
                          <option value="loan">Loan</option>
                          <option value="rent">Rent</option>
                          <option value="mortgage">Mortgage</option>
                          <option value="receivable">Receivable</option>
                          <option value="utility">Utility</option>
                          <option value="subscription">Subscription</option>
                          <option value="insurance">Insurance</option>
                          <option value="other">Other</option>
                        </select>
                      </label>
                    </div>

                    {commitmentDraft.type === 'subscription' && (
                      <label>
                        Paid Using Credit Card
                        <select
                          value={commitmentDraft.linkedCreditCardId ?? 'none'}
                          onChange={(event) =>
                            setCommitmentDraft((previous) => ({
                              ...previous,
                              linkedCreditCardId: event.target.value === 'none' ? null : event.target.value,
                            }))
                          }
                        >
                          <option value="none">Not linked to a card</option>
                          {creditCards.map((card) => (
                            <option key={card.id} value={card.id}>
                              {card.name}{card.issuer ? ` (${card.issuer})` : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    <div className="row-inputs">
                      <label>
                        Current Amount
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={inputNumberValue(commitmentDraft.currentAmount)}
                          onChange={(event) =>
                            setCommitmentDraft((previous) => ({
                              ...previous,
                              currentAmount: parseNumberInput(event.target.value),
                            }))
                          }
                          required
                        />
                      </label>
                      <label>
                        Due Date
                        <select
                          value={commitmentDraft.dueDay === null ? 'none' : String(commitmentDraft.dueDay)}
                          onChange={(event) =>
                            setCommitmentDraft((previous) => ({
                              ...previous,
                              dueDay: event.target.value === 'none' ? null : Number(event.target.value),
                            }))
                          }
                        >
                          <option value="none">No due date</option>
                          {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                            <option key={day} value={day}>
                              Day {day} of month
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <label>
                      Notes
                      <textarea
                        value={commitmentDraft.notes}
                        onChange={(event) =>
                          setCommitmentDraft((previous) => ({ ...previous, notes: event.target.value }))
                        }
                        placeholder="Optional notes"
                      />
                    </label>

                    <div className="split-row">
                      <button type="submit" className="primary-btn">
                        <Plus size={16} />
                        {commitmentDraft.id ? 'Save Changes' : 'Add Obligation'}
                      </button>
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => {
                          setCommitmentDraft(emptyBudgetCommitment())
                          setShowCommitmentForm(false)
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {initialCommitments.length > 0 && (
                  <div className="cc-summary-bar">
                    <div className="cc-summary-item">
                      <span>Total Outgoing / Month</span>
                      <strong className="cc-util-danger">{formatMoney(initialCommitmentSummary.payments, currency)}</strong>
                    </div>
                    <div className="cc-summary-item">
                      <span>Total Incoming / Month</span>
                      <strong className="cc-available">{formatMoney(initialCommitmentSummary.collections, currency)}</strong>
                    </div>
                    <div className="cc-summary-item">
                      <span>Net Flow</span>
                      <strong
                        className={
                          initialCommitmentSummary.collections - initialCommitmentSummary.payments >= 0
                            ? 'cc-available'
                            : 'cc-util-danger'
                        }
                      >
                        {formatMoney(initialCommitmentSummary.collections - initialCommitmentSummary.payments, currency)}
                      </strong>
                    </div>
                    <div className="cc-summary-item">
                      <span>Obligations</span>
                      <strong>{initialCommitments.length}</strong>
                    </div>
                  </div>
                )}

                {initialCommitments.length === 0 && !showCommitmentForm && (
                  <div className="cc-empty-state">
                    <p>No obligations added yet. Click <strong>Add Obligation</strong> to get started.</p>
                  </div>
                )}

                <div className="cc-card-grid">
                  {initialCommitments.map((item) => {
                    const typeMeta = commitmentTypeMeta[item.type]
                    const isIncoming = item.direction === 'collection'
                    const amount = safeNumber(item.currentAmount)
                    const linkedCard =
                      item.type === 'subscription'
                        ? creditCards.find((card) => card.id === item.linkedCreditCardId)
                        : null

                    return (
                      <div key={item.id} className="cc-card-tile">
                        <div className="cc-card-top">
                          <div className="cc-card-identity">
                            <strong className="cc-card-name">{item.name}</strong>
                            <span className="cc-card-issuer">{typeMeta.label}</span>
                          </div>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="ghost-btn"
                              onClick={() => {
                                setCommitmentDraft(item)
                                setShowCommitmentForm(true)
                              }}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              type="button"
                              className="ghost-btn danger"
                              onClick={() => void commitmentsStore.remove(item.id)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        <div className="ob-amount-row">
                          <span className={`ob-direction-badge ${isIncoming ? 'ob-incoming' : 'ob-outgoing'}`}>
                            {isIncoming ? 'Incoming' : 'Outgoing'}
                          </span>
                          <strong className={`ob-amount ${isIncoming ? 'cc-available' : 'cc-util-danger'}`}>
                            {formatMoney(amount, currency)}
                          </strong>
                        </div>

                        <div className="cc-card-meta">
                          <span>Due <strong>{item.dueDay === null ? 'N/A' : `Day ${item.dueDay}`}</strong></span>
                          <span>Recurring <strong>{item.recurringMonthly ? 'Monthly' : 'No'}</strong></span>
                          {item.type === 'subscription' && (
                            <span>Card <strong>{linkedCard?.name ?? 'Not linked'}</strong></span>
                          )}
                        </div>

                        {item.notes && (
                          <p className="cc-card-notes">{item.notes}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>

              <section className="card span-3">
                <div className="cc-section-header">
                  <div>
                    <h2>Credit Cards</h2>
                    <p>Track limits, utilization, APR, and payment due dates across all your cards.</p>
                  </div>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => {
                      setCreditCardDraft(emptyCreditCard())
                      setShowCreditCardForm((previous) => !previous)
                    }}
                  >
                    <Plus size={15} />
                    {showCreditCardForm ? 'Cancel' : 'Add Card'}
                  </button>
                </div>

                {showCreditCardForm && (
                  <form
                    className="stack-form cc-form-panel"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void creditCardsStore.upsert({
                        ...creditCardDraft,
                        name: creditCardDraft.name.trim(),
                        issuer: creditCardDraft.issuer.trim(),
                        creditLimit: safeNumber(creditCardDraft.creditLimit),
                        currentUsage: safeNumber(creditCardDraft.currentUsage),
                        apr: safeNumber(creditCardDraft.apr),
                        minimumPayment: safeNumber(creditCardDraft.minimumPayment),
                        dueDay: creditCardDraft.dueDay,
                        interestChargeDay: creditCardDraft.interestChargeDay ?? null,
                      })
                      setCreditCardDraft(emptyCreditCard())
                      setShowCreditCardForm(false)
                    }}
                  >
                    <h3>{creditCardDraft.id ? 'Edit Card' : 'New Card'}</h3>
                    <div className="row-inputs">
                      <label>
                        Card Name
                        <input
                          type="text"
                          value={creditCardDraft.name}
                          onChange={(event) =>
                            setCreditCardDraft((previous) => ({ ...previous, name: event.target.value }))
                          }
                          placeholder="Visa Platinum"
                          required
                        />
                      </label>
                      <label>
                        Issuer / Bank
                        <input
                          type="text"
                          value={creditCardDraft.issuer}
                          onChange={(event) =>
                            setCreditCardDraft((previous) => ({ ...previous, issuer: event.target.value }))
                          }
                          placeholder="HDFC, SBI, Chase…"
                        />
                      </label>
                    </div>

                    <div className="row-inputs">
                      <label>
                        Credit Limit
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={inputNumberValue(creditCardDraft.creditLimit)}
                          onChange={(event) =>
                            setCreditCardDraft((previous) => ({
                              ...previous,
                              creditLimit: parseNumberInput(event.target.value),
                            }))
                          }
                          required
                        />
                      </label>
                      <label>
                        Current Usage
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={inputNumberValue(creditCardDraft.currentUsage)}
                          onChange={(event) =>
                            setCreditCardDraft((previous) => ({
                              ...previous,
                              currentUsage: parseNumberInput(event.target.value),
                            }))
                          }
                          required
                        />
                      </label>
                    </div>

                    <div className="row-inputs">
                      <label>
                        APR (%)
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={inputNumberValue(creditCardDraft.apr)}
                          onChange={(event) =>
                            setCreditCardDraft((previous) => ({
                              ...previous,
                              apr: parseNumberInput(event.target.value),
                            }))
                          }
                        />
                      </label>
                      <label>
                        Minimum Payment
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={inputNumberValue(creditCardDraft.minimumPayment)}
                          onChange={(event) =>
                            setCreditCardDraft((previous) => ({
                              ...previous,
                              minimumPayment: parseNumberInput(event.target.value),
                            }))
                          }
                        />
                      </label>
                    </div>

                    <div className="row-inputs">
                      <label>
                        Statement Due Date
                        <select
                          value={creditCardDraft.dueDay === null ? 'none' : String(creditCardDraft.dueDay)}
                          onChange={(event) =>
                            setCreditCardDraft((previous) => ({
                              ...previous,
                              dueDay: event.target.value === 'none' ? null : Number(event.target.value),
                            }))
                          }
                        >
                          <option value="none">No due date</option>
                          {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                            <option key={day} value={day}>
                              Day {day} of month
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Interest Charged Date
                        <select
                          value={creditCardDraft.interestChargeDay == null ? 'none' : String(creditCardDraft.interestChargeDay)}
                          onChange={(event) =>
                            setCreditCardDraft((previous) => ({
                              ...previous,
                              interestChargeDay: event.target.value === 'none' ? null : Number(event.target.value),
                            }))
                          }
                        >
                          <option value="none">No interest date</option>
                          {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                            <option key={day} value={day}>
                              Day {day} of month
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="row-inputs">
                      <label className="checkbox-label" style={{ paddingTop: 22 }}>
                        <input
                          type="checkbox"
                          checked={creditCardDraft.active}
                          onChange={(event) =>
                            setCreditCardDraft((previous) => ({ ...previous, active: event.target.checked }))
                          }
                        />
                        Active card
                      </label>
                    </div>

                    <label>
                      Notes
                      <textarea
                        value={creditCardDraft.notes}
                        onChange={(event) =>
                          setCreditCardDraft((previous) => ({ ...previous, notes: event.target.value }))
                        }
                        placeholder="Optional notes"
                      />
                    </label>

                    <div className="split-row">
                      <button type="submit" className="primary-btn">
                        <Plus size={16} />
                        {creditCardDraft.id ? 'Save Changes' : 'Add Credit Card'}
                      </button>
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => {
                          setCreditCardDraft(emptyCreditCard())
                          setShowCreditCardForm(false)
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {creditCards.length > 0 && (
                  <div className="cc-summary-bar">
                    <div className="cc-summary-item">
                      <span>Total Limit</span>
                      <strong>{formatMoney(creditCardSummary.limit, currency)}</strong>
                    </div>
                    <div className="cc-summary-item">
                      <span>Total Used</span>
                      <strong>{formatMoney(creditCardSummary.usage, currency)}</strong>
                    </div>
                    <div className="cc-summary-item">
                      <span>Linked Subscriptions</span>
                      <strong>{formatMoney(creditCardSummary.subscriptionUsage, currency)}</strong>
                    </div>
                    <div className="cc-summary-item">
                      <span>Available</span>
                      <strong className="cc-available">{formatMoney(creditCardSummary.available, currency)}</strong>
                    </div>
                    <div className="cc-summary-item">
                      <span>Overall Utilization</span>
                      <strong
                        className={
                          creditCardSummary.utilizationRate >= 75
                            ? 'cc-util-danger'
                            : creditCardSummary.utilizationRate >= 30
                              ? 'cc-util-warn'
                              : 'cc-util-good'
                        }
                      >
                        {creditCardSummary.utilizationRate.toFixed(1)}%
                      </strong>
                    </div>
                    <div className="cc-summary-item">
                      <span>Min. Payments / Month</span>
                      <strong>{formatMoney(creditCardSummary.minimumPayment, currency)}</strong>
                    </div>
                    <div className="cc-summary-item">
                      <span>Projected APR / Month</span>
                      <strong>{formatMoney(creditCardSummary.projectedMonthlyInterest, currency)}</strong>
                    </div>
                    <div className="cc-summary-item">
                      <span>Weighted APR</span>
                      <strong>{creditCardSummary.weightedAprRate.toFixed(2)}%</strong>
                    </div>
                    <div className="cc-summary-item">
                      <span>Cards</span>
                      <strong>{creditCards.length}</strong>
                    </div>
                  </div>
                )}

                {creditCards.length === 0 && !showCreditCardForm && (
                  <div className="cc-empty-state">
                    <p>No credit cards added yet. Click <strong>Add Card</strong> to get started.</p>
                  </div>
                )}

                <div className="cc-card-grid">
                  {creditCards.map((card) => {
                    const limit = safeNumber(card.creditLimit)
                    const linkedSubscriptionUsage = safeNumber(linkedSubscriptionByCard[card.id] ?? 0)
                    const usage = safeNumber(card.currentUsage) + linkedSubscriptionUsage
                    const projectedMonthlyAprCharge = roundCurrency(
                      usage * (safeNumber(card.apr) / 100 / 12),
                    )
                    const available = limit - usage
                    const utilization = limit > 0 ? (usage / limit) * 100 : 0
                    const utilizationClass =
                      utilization >= 75
                        ? 'cc-util-danger'
                        : utilization >= 30
                          ? 'cc-util-warn'
                          : 'cc-util-good'

                    return (
                      <div key={card.id} className="cc-card-tile">
                        <div className="cc-card-top">
                          <div className="cc-card-identity">
                            <strong className="cc-card-name">{card.name}</strong>
                            {card.issuer && <span className="cc-card-issuer">{card.issuer}</span>}
                          </div>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="ghost-btn"
                              onClick={() => {
                                setCreditCardDraft(card)
                                setShowCreditCardForm(true)
                              }}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              type="button"
                              className="ghost-btn danger"
                              onClick={() => void creditCardsStore.remove(card.id)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        <div className="cc-card-amounts">
                          <div className="cc-amount-block">
                            <span>Used</span>
                            <strong>{formatMoney(usage, currency)}</strong>
                          </div>
                          <div className="cc-amount-sep" />
                          <div className="cc-amount-block">
                            <span>Limit</span>
                            <strong>{formatMoney(limit, currency)}</strong>
                          </div>
                          <div className="cc-amount-sep" />
                          <div className="cc-amount-block">
                            <span>Available</span>
                            <strong className="cc-available">{formatMoney(available, currency)}</strong>
                          </div>
                        </div>

                        <div className="cc-util-bar-wrap">
                          <div className="cc-util-bar-track">
                            <div
                              className={`cc-util-bar-fill ${utilizationClass}`}
                              style={{ width: `${Math.min(utilization, 100)}%` }}
                            />
                          </div>
                          <span className={`cc-util-label ${utilizationClass}`}>
                            {utilization.toFixed(1)}% utilized
                          </span>
                        </div>

                        <div className="cc-card-meta">
                          <span>Base Used <strong>{formatMoney(safeNumber(card.currentUsage), currency)}</strong></span>
                          <span>Subscriptions <strong>{formatMoney(linkedSubscriptionUsage, currency)}</strong></span>
                          <span>APR <strong>{safeNumber(card.apr).toFixed(2)}%</strong></span>
                          <span>Projected APR / Month <strong>{formatMoney(projectedMonthlyAprCharge, currency)}</strong></span>
                          <span>Min. Payment <strong>{formatMoney(safeNumber(card.minimumPayment), currency)}</strong></span>
                          <span>Due <strong>{card.dueDay === null ? 'N/A' : `Day ${card.dueDay}`}</strong></span>
                          <span>Interest Charged <strong>{card.interestChargeDay == null ? 'N/A' : `Day ${card.interestChargeDay}`}</strong></span>
                        </div>

                        {card.notes && (
                          <p className="cc-card-notes">{card.notes}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>

              <section className="card span-3">
                <div className="cc-section-header">
                  <div>
                    <h2>Budget Categories</h2>
                    <p>Create, manage, and monitor each spending bucket with limits, utilization, and overrun alerts.</p>
                  </div>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => {
                      setBudgetDraft(emptyBudget())
                      setShowBudgetForm((previous) => !previous)
                    }}
                  >
                    <Plus size={15} />
                    {showBudgetForm ? 'Cancel' : 'Add Category'}
                  </button>
                </div>

                {showBudgetForm && (
                  <form
                    className="stack-form cc-form-panel"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void budgetsStore.upsert({
                        ...budgetDraft,
                        category: budgetDraft.category.trim(),
                        monthlyLimit: safeNumber(budgetDraft.monthlyLimit),
                        color: normalizeHexColor(budgetDraft.color, '#f97316'),
                      })
                      setBudgetDraft(emptyBudget())
                      setShowBudgetForm(false)
                    }}
                  >
                    <h3>{budgetDraft.id ? 'Edit Budget Category' : 'New Budget Category'}</h3>
                    <label>
                      Category Preset
                      <select
                        value={budgetCategoryPresets.includes(budgetDraft.category as (typeof budgetCategoryPresets)[number])
                          ? budgetDraft.category
                          : 'custom'}
                        onChange={(event) => {
                          if (event.target.value === 'custom') {
                            return
                          }

                          setBudgetDraft((previous) => ({ ...previous, category: event.target.value }))
                        }}
                      >
                        <option value="custom">Custom</option>
                        {budgetCategoryPresets.map((preset) => (
                          <option key={preset} value={preset}>{preset}</option>
                        ))}
                      </select>
                    </label>
                    <div className="row-inputs">
                      <label>
                        Category Name
                        <input
                          type="text"
                          value={budgetDraft.category}
                          onChange={(event) =>
                            setBudgetDraft((previous) => ({ ...previous, category: event.target.value }))
                          }
                          required
                        />
                      </label>
                      <label>
                        Monthly Limit
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={inputNumberValue(budgetDraft.monthlyLimit)}
                          onChange={(event) =>
                            setBudgetDraft((previous) => ({
                              ...previous,
                              monthlyLimit: parseNumberInput(event.target.value),
                            }))
                          }
                          required
                        />
                      </label>
                    </div>
                    <label>
                      Color
                      <input
                        type="color"
                        value={normalizeHexColor(budgetDraft.color, '#f97316')}
                        onChange={(event) =>
                          setBudgetDraft((previous) => ({ ...previous, color: event.target.value }))
                        }
                      />
                    </label>
                    <div className="split-row">
                      <button type="submit" className="primary-btn">
                        <Plus size={15} />
                        {budgetDraft.id ? 'Save Category' : 'Add Category'}
                      </button>
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => {
                          setBudgetDraft(emptyBudget())
                          setShowBudgetForm(false)
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {expensesByCategory.length > 0 && (
                  <div className="cc-summary-bar">
                    <div className="cc-summary-item">
                      <span>Category Count</span>
                      <strong>{expensesByCategory.length}</strong>
                    </div>
                    <div className="cc-summary-item">
                      <span>Total Monthly Limit</span>
                      <strong>{formatMoney(budgetCategorySummary.limit, currency)}</strong>
                    </div>
                    <div className="cc-summary-item">
                      <span>Total Spent</span>
                      <strong>{formatMoney(budgetCategorySummary.spent, currency)}</strong>
                    </div>
                    <div className="cc-summary-item">
                      <span>Remaining</span>
                      <strong className={budgetCategorySummary.limit - budgetCategorySummary.spent >= 0 ? 'cc-available' : 'cc-util-danger'}>
                        {formatMoney(budgetCategorySummary.limit - budgetCategorySummary.spent, currency)}
                      </strong>
                    </div>
                    <div className="cc-summary-item">
                      <span>Over Limit Categories</span>
                      <strong className={budgetCategorySummary.overspent > 0 ? 'cc-util-danger' : 'cc-util-good'}>
                        {budgetCategorySummary.overspent}
                      </strong>
                    </div>
                  </div>
                )}

                {expensesByCategory.length === 0 && !showBudgetForm && (
                  <div className="cc-empty-state">
                    <p>No budget categories yet. Click <strong>Add Category</strong> to start planning.</p>
                  </div>
                )}

                <div className="cc-card-grid">
                  {expensesByCategory.map((item) => {
                    const ratio = item.monthlyLimit > 0 ? (safeNumber(item.spent) / safeNumber(item.monthlyLimit)) * 100 : 0
                    const remaining = safeNumber(item.monthlyLimit) - safeNumber(item.spent)
                    const categoryExpenseCount = expensesStore.data.filter((entry) => entry.categoryId === item.id).length
                    const utilizationClass =
                      ratio >= 100
                        ? 'cc-util-danger'
                        : ratio >= 75
                          ? 'cc-util-warn'
                          : 'cc-util-good'

                    return (
                      <div key={item.id} className="cc-card-tile">
                        <div className="cc-card-top">
                          <div className="cc-card-identity">
                            <strong className="cc-card-name">{item.category}</strong>
                            <span className="cc-card-issuer">{categoryExpenseCount} expense entries</span>
                          </div>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="ghost-btn"
                              onClick={() => {
                                setBudgetDraft({
                                  ...item,
                                  color: normalizeHexColor(item.color, '#f97316'),
                                })
                                setShowBudgetForm(true)
                              }}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              type="button"
                              className="ghost-btn danger"
                              onClick={() => void budgetsStore.remove(item.id)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        <div
                          className="cc-card-amounts budget-amounts"
                          style={{ background: `${normalizeHexColor(item.color, '#f97316')}22` }}
                        >
                          <div className="cc-amount-block">
                            <span>Spent</span>
                            <strong style={{ color: 'var(--ink)' }}>{formatMoney(safeNumber(item.spent), currency)}</strong>
                          </div>
                          <div className="cc-amount-sep" />
                          <div className="cc-amount-block">
                            <span>Limit</span>
                            <strong style={{ color: 'var(--ink)' }}>{formatMoney(safeNumber(item.monthlyLimit), currency)}</strong>
                          </div>
                          <div className="cc-amount-sep" />
                          <div className="cc-amount-block">
                            <span>Remaining</span>
                            <strong className={remaining >= 0 ? 'cc-available' : 'cc-util-danger'}>{formatMoney(remaining, currency)}</strong>
                          </div>
                        </div>

                        <div className="cc-util-bar-wrap">
                          <div className="cc-util-bar-track">
                            <div
                              className={`cc-util-bar-fill ${utilizationClass}`}
                              style={{
                                width: `${Math.min(ratio, 100)}%`,
                                backgroundColor: normalizeHexColor(item.color, '#f97316'),
                              }}
                            />
                          </div>
                          <span className={`cc-util-label ${utilizationClass}`}>
                            {ratio.toFixed(1)}% of monthly limit used
                          </span>
                        </div>

                        <div className="cc-card-meta">
                          <span>
                            Color <strong>{normalizeHexColor(item.color, '#f97316').toUpperCase()}</strong>
                          </span>
                          <span>Status <strong>{ratio >= 100 ? 'Over limit' : 'Within limit'}</strong></span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            </>
          )}

          {activeTab === 'settings' && (
            <>
              <section className="page-hero">
                <div>
                  <h1>Account Setup</h1>
                  <p>Configure your profile, commission categories, and recurring templates</p>
                </div>
              </section>

              <section className="card">
                <div className="card-heading">
                  <h2>Account Finance Settings</h2>
                  <p>Set defaults used by your calculator engine</p>
                </div>
                {profileStore.profile && (
                  <div className="data-row">
                    <div>
                      <strong>Saved Profile</strong>
                      <p>
                        {profileStore.profile.displayName} • Default Hourly Income:{' '}
                        {formatMoney(profileStore.profile.defaultHourlyIncome, profileStore.profile.currency)}
                      </p>
                    </div>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => setIsEditingSettings((previous) => !previous)}
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                  </div>
                )}
                {!profileStore.profile && (
                  <div className="data-row">
                    <div>
                      <strong>No saved profile yet</strong>
                      <p>Create profile settings and save once.</p>
                    </div>
                  </div>
                )}
                {isEditingSettings && (
                <form
                  className="stack-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    setSettingsInfo(null)
                    setSettingsError(false)
                    void profileStore
                      .save({
                        displayName: settingsDraft.displayName.trim() || 'Zeno User',
                        defaultHourlyIncome: safeNumber(settingsDraft.defaultHourlyIncome),
                        currency: settingsDraft.currency,
                        payUploadFrequency: settingsDraft.payUploadFrequency,
                      })
                      .then(() => {
                        setSettingsInfo('Default hourly income saved successfully.')
                        setIsEditingSettings(false)
                      })
                      .catch((error: Error) => {
                        setSettingsInfo(error.message)
                        setSettingsError(true)
                      })
                  }}
                >
                  <label>
                    Display Name
                    <input
                      name="displayName"
                      type="text"
                      value={settingsDraft.displayName}
                      onChange={(event) =>
                        setSettingsDraft((previous) => ({
                          ...previous,
                          displayName: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label>
                    Default Hourly Income
                    <input
                      name="defaultHourlyIncome"
                      type="number"
                      min="0"
                      step="0.01"
                      value={inputNumberValue(settingsDraft.defaultHourlyIncome)}
                      onChange={(event) =>
                        setSettingsDraft((previous) => ({
                          ...previous,
                          defaultHourlyIncome: parseNumberInput(event.target.value),
                        }))
                      }
                      required
                    />
                  </label>
                  <label>
                    Currency
                    <select
                      name="currency"
                      value={settingsDraft.currency}
                      onChange={(event) =>
                        setSettingsDraft((previous) => ({ ...previous, currency: event.target.value }))
                      }
                    >
                      <option value="USD">USD</option>
                      <option value="INR">INR</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                    </select>
                  </label>
                  <label>
                    Actual Pay Upload Cycle
                    <select
                      name="payUploadFrequency"
                      value={settingsDraft.payUploadFrequency}
                      onChange={(event) =>
                        setSettingsDraft((previous) => ({
                          ...previous,
                          payUploadFrequency: event.target.value as PayUploadFrequency,
                        }))
                      }
                    >
                      <option value="biweekly">Every 2 weeks</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </label>
                  <button type="submit" className="primary-btn">Save Profile Settings</button>
                  {settingsInfo && (
                    <p className={settingsError ? 'error-text' : 'success-text'}>{settingsInfo}</p>
                  )}
                </form>
                )}
              </section>

              <section className="card span-2">
                <div className="card-heading">
                  <h2>{commissionDraft.id ? 'Edit Commission Category' : 'Create Commission Category'}</h2>
                  <p>Dynamic categories are account-specific and reusable across entries</p>
                </div>
                <form
                  className="stack-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void commissionsStore.upsert({
                      ...commissionDraft,
                      defaultRate: safeNumber(commissionDraft.defaultRate),
                      color: normalizeHexColor(commissionDraft.color, '#0f766e'),
                      tiers: commissionDraft.tiers.map((tier) => ({
                        minItems: safeNumber(tier.minItems),
                        amountPerItem: safeNumber(tier.amountPerItem),
                      })),
                    })
                    setCommissionDraft(emptyCommissionCategory())
                  }}
                >
                  <div className="row-inputs">
                    <label>
                      Category Name
                      <input type="text" value={commissionDraft.name} onChange={(event) => setCommissionDraft((previous) => ({ ...previous, name: event.target.value }))} required />
                    </label>
                    <label>
                      Commission Type
                      <select value={commissionDraft.valueType} onChange={(event) => setCommissionDraft((previous) => ({ ...previous, valueType: event.target.value as CommissionValueType }))}>
                        <option value="percentage">Percentage</option>
                        <option value="fixed">Fixed amount</option>
                        <option value="tiered-per-item">Tiered per item</option>
                      </select>
                    </label>
                  </div>
                  <div className="row-inputs">
                    {commissionDraft.valueType !== 'tiered-per-item' && (
                      <label>
                        {commissionDraft.valueType === 'percentage' ? 'Default Commission Rate %' : 'Default Fixed Commission'}
                        <input type="number" min="0" step="0.1" value={inputNumberValue(commissionDraft.defaultRate)} onChange={(event) => setCommissionDraft((previous) => ({ ...previous, defaultRate: parseNumberInput(event.target.value) }))} required />
                      </label>
                    )}
                  </div>
                  {commissionDraft.valueType === 'tiered-per-item' && (
                    <div className="stack-form">
                      <div className="card-heading">
                        <h2>Tier Rules</h2>
                        <p>Example: 0+ items = $5 each, 5+ items = $10 each</p>
                      </div>
                      {commissionDraft.tiers.map((tier, index) => (
                        <div key={`${tier.minItems}-${index}`} className="row-inputs">
                          <label>
                            Minimum Items
                            <input type="number" min="0" step="1" value={inputNumberValue(tier.minItems)} onChange={(event) => setCommissionDraft((previous) => ({ ...previous, tiers: previous.tiers.map((current, currentIndex) => currentIndex === index ? { ...current, minItems: parseNumberInput(event.target.value) } : current) }))} required />
                          </label>
                          <label>
                            Amount Per Item
                            <input type="number" min="0" step="0.01" value={inputNumberValue(tier.amountPerItem)} onChange={(event) => setCommissionDraft((previous) => ({ ...previous, tiers: previous.tiers.map((current, currentIndex) => currentIndex === index ? { ...current, amountPerItem: parseNumberInput(event.target.value) } : current) }))} required />
                          </label>
                          <button type="button" className="ghost-btn danger" onClick={() => setCommissionDraft((previous) => ({ ...previous, tiers: previous.tiers.filter((_, currentIndex) => currentIndex !== index) }))} disabled={commissionDraft.tiers.length === 1}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      <button type="button" className="secondary-btn" onClick={() => setCommissionDraft((previous) => ({ ...previous, tiers: [...previous.tiers, { minItems: 0, amountPerItem: 0 }] }))}>
                        <Plus size={14} />
                        Add Tier Rule
                      </button>
                    </div>
                  )}
                  <div className="row-inputs">
                    <label>
                      Color
                      <input
                        type="color"
                        value={normalizeHexColor(commissionDraft.color, '#0f766e')}
                        onChange={(event) =>
                          setCommissionDraft((previous) => ({ ...previous, color: event.target.value }))
                        }
                      />
                    </label>
                    <label className="checkbox-label">
                      <input type="checkbox" checked={commissionDraft.active} onChange={(event) => setCommissionDraft((previous) => ({ ...previous, active: event.target.checked }))} />
                      Active for new entries
                    </label>
                  </div>
                  <label>
                    Description
                    <textarea value={commissionDraft.description} onChange={(event) => setCommissionDraft((previous) => ({ ...previous, description: event.target.value }))} />
                  </label>
                  <button type="submit" className="primary-btn">
                    <Plus size={16} />
                    {commissionDraft.id ? 'Save Commission Category' : 'Add Commission Category'}
                  </button>
                </form>

                <div className="data-list">
                  {commissionsStore.data.map((item) => (
                    <article key={item.id} className="data-row">
                      <div>
                        <strong>{item.name}</strong>
                        <p>
                          {item.valueType === 'percentage' ? `${item.defaultRate}% default rate` : item.valueType === 'fixed' ? `${formatMoney(item.defaultRate, currency)} fixed commission` : `${(item.tiers ?? []).length} tier rule(s)`} {item.active ? '• Active' : '• Inactive'}
                        </p>
                        {item.valueType === 'tiered-per-item' && <small>{(item.tiers ?? []).map((tier) => `${tier.minItems}+ items = ${formatMoney(tier.amountPerItem, currency)}/item`).join(' | ')}</small>}
                        {item.description && <small>{item.description}</small>}
                      </div>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() =>
                            setCommissionDraft({
                              ...item,
                              color: normalizeHexColor(item.color, '#0f766e'),
                              tiers: item.tiers ?? [{ minItems: 0, amountPerItem: 0 }],
                            })
                          }
                        >
                          <Pencil size={14} />
                        </button>
                        <button type="button" className="ghost-btn danger" onClick={() => void commissionsStore.remove(item.id)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="card span-2">
                <div className="card-heading">
                  <h2>{templateDraft.id ? 'Edit Recurring Template' : 'Create Recurring Template'}</h2>
                  <p>Auto-projects commission entries for this and next month per account</p>
                </div>
                <form
                  className="stack-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void commissionTemplatesStore.upsert({
                      ...templateDraft,
                      dayOfMonth: Math.max(1, Math.min(28, safeNumber(templateDraft.dayOfMonth, 1))),
                      defaultHours: safeNumber(templateDraft.defaultHours),
                      expectedUnitsSold: safeNumber(templateDraft.expectedUnitsSold),
                      expectedSalesAmount: safeNumber(templateDraft.expectedSalesAmount),
                    })
                    setTemplateDraft((previous) => ({
                      ...emptyCommissionTemplate(),
                      commissionCategoryId:
                        previous.commissionCategoryId || commissionsStore.data[0]?.id || '',
                    }))
                  }}
                >
                  <div className="row-inputs">
                    <label>
                      Template Name
                      <input type="text" value={templateDraft.name} onChange={(event) => setTemplateDraft((previous) => ({ ...previous, name: event.target.value }))} required />
                    </label>
                    <label>
                      Commission Category
                      <select value={templateDraft.commissionCategoryId} onChange={(event) => setTemplateDraft((previous) => ({ ...previous, commissionCategoryId: event.target.value }))} required>
                        <option value="">Select category</option>
                        {commissionsStore.data.filter((item) => item.active).map((category) => (
                          <option key={category.id} value={category.id}>{category.name}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="row-inputs">
                    <label>
                      Day of Month
                      <input type="number" min="1" max="28" value={inputNumberValue(templateDraft.dayOfMonth)} onChange={(event) => setTemplateDraft((previous) => ({ ...previous, dayOfMonth: parseNumberInput(event.target.value) }))} required />
                    </label>
                    <label>
                      Default Hours
                      <input type="number" min="0" step="0.25" value={inputNumberValue(templateDraft.defaultHours)} onChange={(event) => setTemplateDraft((previous) => ({ ...previous, defaultHours: parseNumberInput(event.target.value) }))} required />
                    </label>
                  </div>
                  <div className="row-inputs">
                    <label>
                      Expected Units Sold
                      <input type="number" min="0" step="1" value={inputNumberValue(templateDraft.expectedUnitsSold)} onChange={(event) => setTemplateDraft((previous) => ({ ...previous, expectedUnitsSold: parseNumberInput(event.target.value) }))} required />
                    </label>
                    <label>
                      Expected Sales Amount
                      <input type="number" min="0" step="0.01" value={inputNumberValue(templateDraft.expectedSalesAmount)} onChange={(event) => setTemplateDraft((previous) => ({ ...previous, expectedSalesAmount: parseNumberInput(event.target.value) }))} required />
                    </label>
                    <label className="checkbox-label">
                      <input type="checkbox" checked={templateDraft.active} onChange={(event) => setTemplateDraft((previous) => ({ ...previous, active: event.target.checked }))} />
                      Active template
                    </label>
                  </div>
                  <label>
                    Notes
                    <textarea value={templateDraft.notes} onChange={(event) => setTemplateDraft((previous) => ({ ...previous, notes: event.target.value }))} />
                  </label>
                  <button type="submit" className="primary-btn">
                    <Plus size={16} />
                    {templateDraft.id ? 'Save Template' : 'Add Template'}
                  </button>
                </form>

                <div className="data-list">
                  {commissionTemplatesStore.data.map((item) => {
                    const categoryName = commissionsStore.data.find((category) => category.id === item.commissionCategoryId)?.name ?? 'Unknown category'
                    return (
                      <article key={item.id} className="data-row">
                        <div>
                          <strong>{item.name}</strong>
                          <p>
                            {categoryName} • Day {item.dayOfMonth} • {item.defaultHours}h • {formatMoney(item.expectedSalesAmount, currency)}
                          </p>
                          <small>{item.active ? 'Active auto-projection' : 'Inactive template'}</small>
                        </div>
                        <div className="row-actions">
                          <button type="button" className="ghost-btn" onClick={() => setTemplateDraft(item)}>
                            <Pencil size={14} />
                          </button>
                          <button type="button" className="ghost-btn danger" onClick={() => void commissionTemplatesStore.remove(item.id)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            </>
          )}
        </main>
      )}

      <nav className="mobile-tabbar" aria-label="Mobile navigation">
        <button type="button" className={`mobile-tab-btn ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => navigateToTab('overview')}>
          <Wallet size={16} />
          <span className="mobile-tab-label">Home</span>
        </button>
        <button type="button" className={`mobile-tab-btn ${activeTab === 'routine' ? 'active' : ''}`} onClick={() => navigateToTab('routine')}>
          <CalendarRange size={16} />
          <span className="mobile-tab-label">Routine</span>
        </button>
        <button type="button" className={`mobile-tab-btn ${activeTab === 'datahub' ? 'active' : ''}`} onClick={() => navigateToTab('datahub')}>
          <Database size={16} />
          <span className="mobile-tab-label">Hub</span>
        </button>
        <button type="button" className={`mobile-tab-btn ${activeTab === 'income' ? 'active' : ''}`} onClick={() => navigateToTab('income')}>
          <Coins size={16} />
          <span className="mobile-tab-label">Income</span>
        </button>
        <button type="button" className={`mobile-tab-btn ${activeTab === 'budgeting' ? 'active' : ''}`} onClick={() => navigateToTab('budgeting')}>
          <PiggyBank size={16} />
          <span className="mobile-tab-label">Budget</span>
        </button>
        <button type="button" className={`mobile-tab-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => navigateToTab('settings')}>
          <Settings size={16} />
          <span className="mobile-tab-label">Settings</span>
        </button>
      </nav>
    </div>
  )
}

export default App
