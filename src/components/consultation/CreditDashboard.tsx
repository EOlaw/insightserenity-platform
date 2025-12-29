'use client';

import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  CreditCard,
  TrendingUp,
  TrendingDown,
  Calendar,
  AlertCircle,
  Plus,
  Clock,
  CheckCircle
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface CreditPackage {
  packageId: string;
  packageName: string;
  creditsTotal: number;
  creditsRemaining: number;
  creditsUsed: number;
  purchaseDate: string;
  expiryDate: string;
  status: 'active' | 'expiring_soon' | 'expired';
}

interface CreditStats {
  totalCredits: number;
  usedCredits: number;
  expiringCredits: number;
  expiringIn7Days: number;
  activePackages: number;
}

interface CreditDashboardProps {
  onPurchaseClick?: () => void;
  onViewPackages?: () => void;
}

export default function CreditDashboard({ onPurchaseClick, onViewPackages }: CreditDashboardProps) {
  const [creditStats, setCreditStats] = useState<CreditStats | null>(null);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCreditData();
  }, []);

  const fetchCreditData = async () => {
    try {
      const response = await fetch('/api/credits/balance', {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setCreditStats(data.stats);
        setPackages(data.packages);
      }
    } catch (error) {
      console.error('Failed to fetch credit data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300';
      case 'expiring_soon': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300';
      case 'expired': return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300';
    }
  };

  const getDaysUntilExpiry = (expiryDate: string) => {
    const now = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
          <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </Card>
    );
  }

  const creditsRemaining = (creditStats?.totalCredits || 0) - (creditStats?.usedCredits || 0);
  const usagePercentage = creditStats?.totalCredits
    ? ((creditStats.usedCredits / creditStats.totalCredits) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Credits */}
        <Card className="p-6 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/20 border-violet-200 dark:border-violet-800">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-violet-900 dark:text-violet-100">
              Available Credits
            </h3>
            <CreditCard className="w-5 h-5 text-violet-600 dark:text-violet-400" />
          </div>
          <p className="text-3xl font-bold text-violet-900 dark:text-violet-100">
            {creditsRemaining}
          </p>
          <p className="text-sm text-violet-600 dark:text-violet-400 mt-1">
            of {creditStats?.totalCredits || 0} total
          </p>
          <Progress value={100 - usagePercentage} className="mt-3 h-2" />
        </Card>

        {/* Used Credits */}
        <Card className="p-6 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20 border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Used Credits
            </h3>
            <CheckCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-3xl font-bold text-blue-900 dark:text-blue-100">
            {creditStats?.usedCredits || 0}
          </p>
          <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
            {Math.round(usagePercentage)}% utilized
          </p>
        </Card>

        {/* Expiring Soon */}
        <Card className="p-6 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border-amber-200 dark:border-amber-800">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-amber-900 dark:text-amber-100">
              Expiring Soon
            </h3>
            <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="text-3xl font-bold text-amber-900 dark:text-amber-100">
            {creditStats?.expiringIn7Days || 0}
          </p>
          <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
            within 7 days
          </p>
        </Card>
      </div>

      {/* Low Credit Warning */}
      {creditsRemaining <= 2 && creditsRemaining > 0 && (
        <Card className="p-4 border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/20">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold text-orange-900 dark:text-orange-100">
                Low Credit Balance
              </h4>
              <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">
                You only have {creditsRemaining} {creditsRemaining === 1 ? 'credit' : 'credits'} remaining.
                Purchase more credits to continue booking consultations.
              </p>
              <Button
                size="sm"
                className="mt-3 bg-orange-600 hover:bg-orange-700"
                onClick={onPurchaseClick}
              >
                <Plus className="w-4 h-4 mr-2" />
                Purchase Credits
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Expiring Credits Warning */}
      {(creditStats?.expiringIn7Days || 0) > 0 && (
        <Card className="p-4 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold text-red-900 dark:text-red-100">
                Credits Expiring Soon!
              </h4>
              <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                {creditStats?.expiringIn7Days} {creditStats?.expiringIn7Days === 1 ? 'credit expires' : 'credits expire'} in the next 7 days.
                Book consultations now to use them before they're lost.
              </p>
              <Button
                size="sm"
                className="mt-3 bg-red-600 hover:bg-red-700"
                onClick={onViewPackages}
              >
                <Calendar className="w-4 h-4 mr-2" />
                Book Consultation
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Active Packages */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Credit Packages</h3>
          <Button variant="outline" size="sm" onClick={onViewPackages}>
            View All
          </Button>
        </div>

        {packages.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No active credit packages</p>
            <Button className="mt-4" onClick={onPurchaseClick}>
              <Plus className="w-4 h-4 mr-2" />
              Purchase Your First Package
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {packages.slice(0, 3).map((pkg) => {
              const daysLeft = getDaysUntilExpiry(pkg.expiryDate);
              const usagePercent = (pkg.creditsUsed / pkg.creditsTotal) * 100;

              return (
                <div
                  key={pkg.packageId}
                  className="p-4 border dark:border-gray-700 rounded-lg hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-semibold">{pkg.packageName}</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {pkg.creditsRemaining} of {pkg.creditsTotal} credits remaining
                      </p>
                    </div>
                    <Badge className={getStatusColor(pkg.status)}>
                      {pkg.status === 'expiring_soon' ? `${daysLeft}d left` : pkg.status.replace('_', ' ')}
                    </Badge>
                  </div>

                  <Progress value={100 - usagePercent} className="h-2 mb-2" />

                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>Purchased: {new Date(pkg.purchaseDate).toLocaleDateString()}</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Expires: {new Date(pkg.expiryDate).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button
          className="flex-1 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
          onClick={onPurchaseClick}
        >
          <Plus className="w-4 h-4 mr-2" />
          Purchase Credits
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          onClick={onViewPackages}
        >
          <Calendar className="w-4 h-4 mr-2" />
          Book Consultation
        </Button>
      </div>
    </div>
  );
}
