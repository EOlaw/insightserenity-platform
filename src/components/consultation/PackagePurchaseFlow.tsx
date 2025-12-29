'use client';

import React, { useState, useEffect } from 'react';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe, StripeElementsOptions } from '@stripe/stripe-js';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle,
  Sparkles,
  Clock,
  Users,
  TrendingUp,
  Loader2,
  ArrowRight
} from 'lucide-react';
import StripePaymentForm from './StripePaymentForm';
import { useRouter } from 'next/navigation';

// Initialize Stripe - Replace with your publishable key
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

interface ConsultationPackage {
  packageId: string;
  name: string;
  description: string;
  credits: number;
  price: number;
  duration: number; // in days
  features: string[];
  savings?: number;
  popular?: boolean;
  bestValue?: boolean;
}

interface PackagePurchaseFlowProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function PackagePurchaseFlow({ onSuccess, onCancel }: PackagePurchaseFlowProps) {
  const router = useRouter();
  const [packages, setPackages] = useState<ConsultationPackage[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<ConsultationPackage | null>(null);
  const [clientSecret, setClientSecret] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [creatingPayment, setCreatingPayment] = useState(false);
  const [step, setStep] = useState<'select' | 'payment' | 'success'>('select');

  useEffect(() => {
    fetchPackages();
  }, []);

  const fetchPackages = async () => {
    try {
      const response = await fetch('/api/credits/packages', {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setPackages(data.packages);
      }
    } catch (error) {
      console.error('Failed to fetch packages:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePackageSelect = async (pkg: ConsultationPackage) => {
    setSelectedPackage(pkg);
    setCreatingPayment(true);

    try {
      const response = await fetch('/api/payments/create-payment-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          packageId: pkg.packageId,
          amount: pkg.price * 100, // Convert to cents
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setClientSecret(data.clientSecret);
        setStep('payment');
      } else {
        console.error('Failed to create payment intent');
      }
    } catch (error) {
      console.error('Error creating payment intent:', error);
    } finally {
      setCreatingPayment(false);
    }
  };

  const handlePaymentSuccess = (paymentIntentId: string) => {
    setStep('success');
    setTimeout(() => {
      onSuccess?.();
      router.push('/client/consultations');
    }, 2000);
  };

  const handlePaymentError = (error: string) => {
    console.error('Payment error:', error);
    // Optionally show error to user
  };

  const elementsOptions: StripeElementsOptions = {
    clientSecret,
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: '#8b5cf6',
      },
    },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
      </div>
    );
  }

  // Step 1: Package Selection
  if (step === 'select') {
    return (
      <div className="space-y-6">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold mb-2">Choose Your Consultation Package</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Select the package that best fits your business needs
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {packages.map((pkg) => (
            <Card
              key={pkg.packageId}
              className={`p-6 relative overflow-hidden transition-all hover:shadow-xl ${
                pkg.popular ? 'border-2 border-violet-500 dark:border-violet-400' : ''
              }`}
            >
              {/* Popular Badge */}
              {pkg.popular && (
                <div className="absolute top-0 right-0">
                  <Badge className="rounded-tl-none rounded-br-none bg-violet-600 text-white">
                    <Sparkles className="w-3 h-3 mr-1" />
                    Most Popular
                  </Badge>
                </div>
              )}

              {/* Best Value Badge */}
              {pkg.bestValue && (
                <div className="absolute top-0 left-0">
                  <Badge className="rounded-tr-none rounded-bl-none bg-green-600 text-white">
                    <TrendingUp className="w-3 h-3 mr-1" />
                    Best Value
                  </Badge>
                </div>
              )}

              <div className="mt-6">
                <h3 className="text-2xl font-bold mb-2">{pkg.name}</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                  {pkg.description}
                </p>

                {/* Price */}
                <div className="mb-6">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-violet-600 dark:text-violet-400">
                      ${pkg.price.toLocaleString()}
                    </span>
                    {pkg.savings && (
                      <span className="text-sm text-green-600 dark:text-green-400 font-semibold">
                        Save ${pkg.savings}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    ${(pkg.price / pkg.credits).toFixed(2)} per credit
                  </p>
                </div>

                {/* Features */}
                <div className="space-y-3 mb-6">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                    <span><strong>{pkg.credits}</strong> Consultation Credits</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                    <span>Valid for <strong>{pkg.duration} days</strong></span>
                  </div>
                  {pkg.features.map((feature, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm">
                      <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>

                {/* CTA Button */}
                <Button
                  className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
                  onClick={() => handlePackageSelect(pkg)}
                  disabled={creatingPayment}
                >
                  {creatingPayment && selectedPackage?.packageId === pkg.packageId ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      Select Package
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {/* Money-Back Guarantee */}
        <Card className="p-6 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border-green-200 dark:border-green-800">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full">
              <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h4 className="font-semibold text-green-900 dark:text-green-100">
                100% Satisfaction Guarantee
              </h4>
              <p className="text-sm text-green-700 dark:text-green-300">
                If you're not satisfied with your first consultation, we'll refund your credit - no questions asked.
              </p>
            </div>
          </div>
        </Card>

        {onCancel && (
          <div className="text-center">
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Step 2: Payment
  if (step === 'payment' && selectedPackage && clientSecret) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep('select')}
            className="mb-4"
          >
            ← Back to Packages
          </Button>
          <h2 className="text-2xl font-bold mb-2">Complete Your Purchase</h2>
          <p className="text-gray-600 dark:text-gray-400">
            You're almost done! Enter your payment details below.
          </p>
        </div>

        <Elements stripe={stripePromise} options={elementsOptions}>
          <StripePaymentForm
            packageId={selectedPackage.packageId}
            packageName={selectedPackage.name}
            amount={selectedPackage.price * 100}
            creditsIncluded={selectedPackage.credits}
            onSuccess={handlePaymentSuccess}
            onError={handlePaymentError}
          />
        </Elements>
      </div>
    );
  }

  // Step 3: Success
  if (step === 'success') {
    return (
      <div className="max-w-md mx-auto text-center py-12">
        <div className="mb-6">
          <div className="w-20 h-20 mx-auto bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
            <CheckCircle className="w-12 h-12 text-green-600 dark:text-green-400" />
          </div>
        </div>
        <h2 className="text-3xl font-bold mb-4">Purchase Successful!</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Your {selectedPackage?.credits} consultation credits have been added to your account.
          You'll receive a confirmation email shortly.
        </p>
        <div className="space-y-3">
          <Button
            className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
            onClick={() => router.push('/client/consultations/book')}
          >
            Book Your First Consultation
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => router.push('/client/dashboard')}
          >
            Go to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
