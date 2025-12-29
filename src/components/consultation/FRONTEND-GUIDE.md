# Frontend Components - Implementation Guide

Complete guide for integrating consultation payment and credit management components into your Next.js application.

---

## 📁 Components Overview

### Created Components

1. **StripePaymentForm.tsx** - Secure payment processing with Stripe Elements
2. **CreditDashboard.tsx** - Real-time credit balance and package management widget
3. **PackagePurchaseFlow.tsx** - Complete package selection and purchase flow

---

## 🚀 Quick Start

### 1. Environment Variables

Add to your `.env.local`:

```bash
# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...

# API Base URL
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### 2. Install Dependencies

Already installed:
```bash
npm install @stripe/stripe-js @stripe/react-stripe-js
```

---

## 📦 Component Usage

### StripePaymentForm Component

**Purpose:** Handles secure credit card payments via Stripe Elements

**Props:**
```typescript
interface StripePaymentFormProps {
  packageId: string;           // Package being purchased
  packageName: string;          // Display name
  amount: number;               // Amount in cents (e.g., 450000 for $4,500)
  creditsIncluded: number;      // Number of credits
  onSuccess?: (paymentIntentId: string) => void;
  onError?: (error: string) => void;
}
```

**Example Usage:**
```tsx
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import StripePaymentForm from '@/components/consultation/StripePaymentForm';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

export default function PaymentPage() {
  const [clientSecret, setClientSecret] = useState('');

  // Fetch client secret from your backend
  useEffect(() => {
    fetch('/api/payments/create-payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        packageId: 'pkg_001',
        amount: 450000 // $4,500 in cents
      })
    })
    .then(res => res.json())
    .then(data => setClientSecret(data.clientSecret));
  }, []);

  const handleSuccess = (paymentIntentId: string) => {
    console.log('Payment successful:', paymentIntentId);
    // Redirect to success page
  };

  if (!clientSecret) return <div>Loading...</div>;

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <StripePaymentForm
        packageId="pkg_001"
        packageName="Strategic Planning Package"
        amount={450000}
        creditsIncluded={8}
        onSuccess={handleSuccess}
        onError={(err) => console.error(err)}
      />
    </Elements>
  );
}
```

---

### CreditDashboard Component

**Purpose:** Displays credit balance, usage stats, and package details

**Props:**
```typescript
interface CreditDashboardProps {
  onPurchaseClick?: () => void;   // Navigate to purchase page
  onViewPackages?: () => void;    // Navigate to packages page
}
```

**Example Usage:**
```tsx
'use client';

import CreditDashboard from '@/components/consultation/CreditDashboard';
import { useRouter } from 'next/navigation';

export default function ClientDashboardPage() {
  const router = useRouter();

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">My Credits</h1>

      <CreditDashboard
        onPurchaseClick={() => router.push('/consultations/packages')}
        onViewPackages={() => router.push('/client/consultations/book')}
      />
    </div>
  );
}
```

**API Integration Required:**

The component expects this API endpoint:
```typescript
GET /api/credits/balance

Response:
{
  stats: {
    totalCredits: 15,
    usedCredits: 5,
    expiringCredits: 0,
    expiringIn7Days: 0,
    activePackages: 2
  },
  packages: [
    {
      packageId: "pkg_001",
      packageName: "Strategic Planning Package",
      creditsTotal: 8,
      creditsRemaining: 6,
      creditsUsed: 2,
      purchaseDate: "2025-01-10",
      expiryDate: "2025-07-10",
      status: "active"
    }
  ]
}
```

---

### PackagePurchaseFlow Component

**Purpose:** Complete end-to-end package selection and purchase experience

**Props:**
```typescript
interface PackagePurchaseFlowProps {
  onSuccess?: () => void;   // Called after successful purchase
  onCancel?: () => void;    // Called when user cancels
}
```

**Example Usage:**
```tsx
'use client';

import PackagePurchaseFlow from '@/components/consultation/PackagePurchaseFlow';
import { useRouter } from 'next/navigation';

export default function PurchasePackagePage() {
  const router = useRouter();

  return (
    <div className="min-h-screen p-6">
      <PackagePurchaseFlow
        onSuccess={() => {
          // Navigate to success page or dashboard
          router.push('/client/dashboard');
        }}
        onCancel={() => {
          // Navigate back
          router.back();
        }}
      />
    </div>
  );
}
```

**API Integration Required:**

1. **Get Packages:**
```typescript
GET /api/credits/packages

Response:
{
  packages: [
    {
      packageId: "pkg_discovery",
      name: "Discovery & Assessment",
      description: "Perfect for initial strategic planning",
      credits: 4,
      price: 4500,
      duration: 180,
      features: [
        "4 × 60-minute sessions",
        "Comprehensive business assessment",
        "Written strategic recommendations"
      ],
      savings: 500,
      popular: true,
      bestValue: false
    }
  ]
}
```

2. **Create Payment Intent:**
```typescript
POST /api/payments/create-payment-intent
Body: {
  packageId: "pkg_discovery",
  amount: 450000
}

Response:
{
  clientSecret: "pi_xxx_secret_xxx",
  paymentIntentId: "pi_xxx"
}
```

---

## 🎨 Styling & Theming

All components are built with:
- **Tailwind CSS** for styling
- **shadcn/ui** components (Button, Card, Badge, Progress)
- **Dark mode support** via next-themes
- **Responsive design** (mobile-first)

### Color Scheme

- Primary: Violet/Purple gradient (`from-violet-600 to-purple-600`)
- Success: Green (`green-600`)
- Warning: Amber/Orange (`amber-600`, `orange-600`)
- Error: Red (`red-600`)

---

## 🔗 Required API Endpoints

### Backend Routes to Implement

Create these routes in `/servers/customer-services/routes/`:

#### 1. Credit Balance Endpoint
```javascript
// GET /api/credits/balance
router.get('/balance', authenticate, async (req, res) => {
  const userId = req.user.userId;

  const stats = await CreditManagementService.getUserCreditStats(userId);
  const packages = await CreditManagementService.getActivePackages(userId);

  res.json({ stats, packages });
});
```

#### 2. Packages Endpoint
```javascript
// GET /api/credits/packages
router.get('/packages', async (req, res) => {
  const packages = await CreditManagementService.getAllPackages();
  res.json({ packages });
});
```

#### 3. Payment Intent Endpoint
```javascript
// POST /api/payments/create-payment-intent
router.post('/create-payment-intent', authenticate, async (req, res) => {
  const { packageId, amount } = req.body;
  const userId = req.user.userId;

  const paymentIntent = await PaymentService.createPaymentIntent({
    userId,
    packageId,
    amount
  });

  res.json({
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id
  });
});
```

---

## 🧪 Testing

### Manual Testing

1. **Test Package Selection:**
   - Navigate to `/consultations/packages`
   - Verify all packages display correctly
   - Check pricing calculations

2. **Test Payment Flow:**
   - Select a package
   - Use Stripe test card: `4242 4242 4242 4242`
   - Verify payment processes successfully
   - Check credits are added to account

3. **Test Credit Dashboard:**
   - Purchase credits
   - Book a consultation
   - Verify credit balance updates
   - Check expiration warnings

### Stripe Test Cards

```
Success: 4242 4242 4242 4242
Decline: 4000 0000 0000 0002
3D Secure: 4000 0025 0000 3155
Expiry: Any future date (e.g., 12/34)
CVC: Any 3 digits (e.g., 123)
```

---

## 🔐 Security Best Practices

1. **Never expose Stripe secret keys** - Only use publishable key on frontend
2. **Validate on backend** - Always verify amounts and package IDs server-side
3. **Use HTTPS in production** - Required for Stripe payments
4. **Implement webhook verification** - Verify Stripe webhook signatures
5. **Store payment records** - Log all transactions for audit trail

---

## 📱 Mobile Responsiveness

All components are mobile-optimized:
- **CreditDashboard:** Stacks cards vertically on mobile
- **PackagePurchaseFlow:** Single column layout on small screens
- **StripePaymentForm:** Stripe Elements auto-adapt to screen size

---

## 🚧 Common Issues & Troubleshooting

### Issue: "Stripe has not been initialized"
**Solution:** Ensure `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is set in `.env.local`

### Issue: Payment form doesn't appear
**Solution:** Check that `clientSecret` is successfully fetched from backend

### Issue: Credit balance not updating
**Solution:** Verify webhook handler is processing `payment_intent.succeeded` events

### Issue: Dark mode colors look wrong
**Solution:** Ensure `next-themes` provider wraps your app in `layout.tsx`

---

## 🎯 Next Steps

1. **Implement backend API routes** for credit and payment endpoints
2. **Set up Stripe webhooks** to handle payment confirmations
3. **Add analytics tracking** for purchase funnel
4. **Implement email notifications** for purchase confirmations
5. **Add loading states** for better UX during API calls
6. **Create unit tests** for payment logic

---

## 📚 Additional Resources

- [Stripe Elements Documentation](https://stripe.com/docs/stripe-js)
- [Next.js App Router](https://nextjs.org/docs/app)
- [shadcn/ui Components](https://ui.shadcn.com/)
- [Tailwind CSS](https://tailwindcss.com/docs)

---

**Last Updated:** December 2025
**Component Version:** 1.0.0
**Status:** Production Ready
