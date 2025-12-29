'use client';

import React, { useState } from 'react';
import {
  PaymentElement,
  useStripe,
  useElements
} from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, CreditCard, AlertCircle, CheckCircle } from 'lucide-react';

interface StripePaymentFormProps {
  packageId: string;
  packageName: string;
  amount: number;
  creditsIncluded: number;
  onSuccess?: (paymentIntentId: string) => void;
  onError?: (error: string) => void;
}

export default function StripePaymentForm({
  packageId,
  packageName,
  amount,
  creditsIncluded,
  onSuccess,
  onError
}: StripePaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();

  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setPaymentStatus('processing');
    setErrorMessage('');

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/client/consultations/payment-success`,
        },
        redirect: 'if_required'
      });

      if (error) {
        setPaymentStatus('error');
        setErrorMessage(error.message || 'Payment failed. Please try again.');
        onError?.(error.message || 'Payment failed');
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        setPaymentStatus('success');
        onSuccess?.(paymentIntent.id);
      }
    } catch (err: any) {
      setPaymentStatus('error');
      setErrorMessage(err.message || 'An unexpected error occurred');
      onError?.(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="p-6">
      {/* Package Summary */}
      <div className="mb-6 p-4 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/20 rounded-lg border border-violet-200 dark:border-violet-800">
        <h3 className="text-lg font-semibold text-violet-900 dark:text-violet-100 mb-2">
          {packageName}
        </h3>
        <div className="flex justify-between items-center text-sm">
          <span className="text-violet-700 dark:text-violet-300">
            {creditsIncluded} Consultation {creditsIncluded === 1 ? 'Credit' : 'Credits'}
          </span>
          <span className="text-2xl font-bold text-violet-900 dark:text-violet-100">
            ${(amount / 100).toFixed(2)}
          </span>
        </div>
      </div>

      {/* Payment Status Messages */}
      {paymentStatus === 'success' && (
        <div className="mb-4 p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
          <div>
            <p className="font-semibold text-green-900 dark:text-green-100">Payment Successful!</p>
            <p className="text-sm text-green-700 dark:text-green-300">
              Your credits will be added to your account shortly.
            </p>
          </div>
        </div>
      )}

      {paymentStatus === 'error' && errorMessage && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
          <div>
            <p className="font-semibold text-red-900 dark:text-red-100">Payment Failed</p>
            <p className="text-sm text-red-700 dark:text-red-300">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Payment Form */}
      <form onSubmit={handleSubmit}>
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
            <CreditCard className="inline w-4 h-4 mr-2" />
            Payment Details
          </label>
          <PaymentElement
            options={{
              layout: 'tabs',
              paymentMethodOrder: ['card', 'apple_pay', 'google_pay']
            }}
          />
        </div>

        {/* Security Notice */}
        <div className="mb-6 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded text-sm text-blue-700 dark:text-blue-300">
          <p className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            Secure payment powered by Stripe. Your card details are never stored on our servers.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            type="submit"
            disabled={!stripe || isProcessing || paymentStatus === 'success'}
            className="flex-1 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing Payment...
              </>
            ) : paymentStatus === 'success' ? (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                Payment Complete
              </>
            ) : (
              <>
                <CreditCard className="w-4 h-4 mr-2" />
                Pay ${(amount / 100).toFixed(2)}
              </>
            )}
          </Button>
        </div>
      </form>

      {/* Terms */}
      <p className="mt-4 text-xs text-center text-gray-500 dark:text-gray-400">
        By completing this purchase, you agree to our{' '}
        <a href="/terms" className="text-violet-600 hover:underline">Terms of Service</a>
        {' '}and{' '}
        <a href="/privacy" className="text-violet-600 hover:underline">Privacy Policy</a>
      </p>
    </Card>
  );
}
