/**
 * Seed Consultation Packages Script
 * Creates default consultation packages in the database
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import database connection
const database = require('../../../shared/lib/database');

// Consultation packages data matching PRICING_STRATEGY.md
const consultationPackages = [
    {
        packageId: 'PKG-FREE-TRIAL-0001',
        tenantId: 'default',
        organizationId: null,
        details: {
            name: 'Free Trial Consultation',
            type: 'free_trial',
            sku: 'FREE-TRIAL-15MIN',
            category: 'trial',
            description: 'One-time 15-minute complimentary consultation for new clients',
            features: [
                'Initial needs assessment',
                'Platform walkthrough',
                'Service overview',
                'Q&A session'
            ],
            termsAndConditions: 'Valid for new clients only. One consultation per client. Expires 30 days after account creation.'
        },
        credits: {
            total: 1,
            duration: { minutes: 15 },
            expiresAfterDays: 30,
            rolloverAllowed: false
        },
        pricing: {
            amount: 0,
            currency: 'USD',
            discount: { percentage: 0 }
        },
        availability: {
            status: 'active',
            featuredPackage: true,
            displayOrder: 1,
            availableFrom: new Date(),
            availableUntil: null
        },
        restrictions: {
            oneTimeOnly: true,
            newClientsOnly: true,
            minimumSubscriptionLevel: null,
            excludedClientTypes: []
        }
    },
    {
        packageId: 'PKG-PAY-PER-USE-0001',
        tenantId: 'default',
        organizationId: null,
        details: {
            name: 'Pay Per Use',
            type: 'pay_per_use',
            sku: 'PPU-60MIN',
            category: 'individual',
            description: 'Single 60-minute consultation session',
            features: [
                'One-on-one expert consultation',
                'Customized solution discussion',
                'Action plan development',
                'Follow-up summary document'
            ],
            termsAndConditions: 'Non-refundable once consultation is confirmed. Reschedule up to 24 hours before scheduled time.'
        },
        credits: {
            total: 1,
            duration: { minutes: 60 },
            expiresAfterDays: 90,
            rolloverAllowed: false
        },
        pricing: {
            amount: 9900, // $99.00
            currency: 'USD',
            discount: { percentage: 0 }
        },
        availability: {
            status: 'active',
            featuredPackage: true,
            displayOrder: 2,
            availableFrom: new Date(),
            availableUntil: null
        },
        restrictions: {
            oneTimeOnly: false,
            newClientsOnly: false,
            minimumSubscriptionLevel: null,
            excludedClientTypes: []
        }
    },
    {
        packageId: 'PKG-STARTER-0001',
        tenantId: 'default',
        organizationId: null,
        details: {
            name: 'Starter Package',
            type: 'consultation_bundle',
            sku: 'STARTER-3X60',
            category: 'individual',
            description: '3 consultation sessions (60 minutes each)',
            features: [
                '3 x 60-minute consultations',
                'Priority scheduling',
                'Email support between sessions',
                'Progress tracking dashboard'
            ],
            termsAndConditions: 'Credits valid for 90 days from purchase. Non-transferable.'
        },
        credits: {
            total: 3,
            duration: { minutes: 60 },
            expiresAfterDays: 90,
            rolloverAllowed: false
        },
        pricing: {
            amount: 29700, // $297.00
            currency: 'USD',
            discount: { percentage: 0 }
        },
        bundleConfiguration: {
            totalSavings: 0,
            savingsPercentage: 0,
            comparisonPrice: 29700
        },
        availability: {
            status: 'active',
            featuredPackage: true,
            displayOrder: 3,
            availableFrom: new Date(),
            availableUntil: null
        },
        restrictions: {
            oneTimeOnly: false,
            newClientsOnly: false,
            minimumSubscriptionLevel: null,
            excludedClientTypes: []
        }
    },
    {
        packageId: 'PKG-PROFESSIONAL-0001',
        tenantId: 'default',
        organizationId: null,
        details: {
            name: 'Professional Package',
            type: 'consultation_bundle',
            sku: 'PRO-5X60',
            category: 'business',
            description: '5 consultation sessions (60 minutes each) - Most Popular',
            features: [
                '5 x 60-minute consultations',
                'Priority scheduling',
                'Dedicated consultant assignment',
                'Email & chat support',
                'Custom action plans',
                'Monthly progress reports'
            ],
            termsAndConditions: 'Credits valid for 90 days from purchase. Can be shared within organization.'
        },
        credits: {
            total: 5,
            duration: { minutes: 60 },
            expiresAfterDays: 90,
            rolloverAllowed: true
        },
        pricing: {
            amount: 45000, // $450.00
            currency: 'USD',
            discount: { percentage: 10, reason: 'Bundle savings' }
        },
        bundleConfiguration: {
            totalSavings: 4500,
            savingsPercentage: 10,
            comparisonPrice: 49500
        },
        availability: {
            status: 'active',
            featuredPackage: true,
            displayOrder: 4,
            availableFrom: new Date(),
            availableUntil: null
        },
        restrictions: {
            oneTimeOnly: false,
            newClientsOnly: false,
            minimumSubscriptionLevel: null,
            excludedClientTypes: []
        }
    },
    {
        packageId: 'PKG-ENTERPRISE-0001',
        tenantId: 'default',
        organizationId: null,
        details: {
            name: 'Enterprise Package',
            type: 'consultation_bundle',
            sku: 'ENT-15X60',
            category: 'enterprise',
            description: '15 consultation sessions (60 minutes each) for teams',
            features: [
                '15 x 60-minute consultations',
                'Team account with up to 10 members',
                'Dedicated account manager',
                '24/7 priority support',
                'Custom integration support',
                'Quarterly business reviews',
                'Custom reporting dashboard'
            ],
            termsAndConditions: 'Credits valid for 180 days from purchase. Transferable within organization.'
        },
        credits: {
            total: 15,
            duration: { minutes: 60 },
            expiresAfterDays: 180,
            rolloverAllowed: true
        },
        pricing: {
            amount: 120000, // $1,200.00
            currency: 'USD',
            discount: { percentage: 20, reason: 'Enterprise savings' }
        },
        bundleConfiguration: {
            totalSavings: 28500,
            savingsPercentage: 19.2,
            comparisonPrice: 148500
        },
        availability: {
            status: 'active',
            featuredPackage: false,
            displayOrder: 5,
            availableFrom: new Date(),
            availableUntil: null
        },
        restrictions: {
            oneTimeOnly: false,
            newClientsOnly: false,
            minimumSubscriptionLevel: null,
            excludedClientTypes: []
        }
    }
];

async function seedPackages() {
    try {
        console.log('Starting consultation packages seed...');

        // Connect to database
        console.log('Connecting to database...');
        const connectionManager = new database.ConnectionManager({
            environment: process.env.NODE_ENV || 'development',
            config: {
                uri: process.env.DATABASE_CUSTOMER_URI || process.env.DATABASE_URI
            }
        });

        await connectionManager.initialize();
        console.log('Database connected successfully');

        // Get ConsultationPackage model
        const ConsultationPackage = connectionManager.getModel('ConsultationPackage', 'customer');

        if (!ConsultationPackage) {
            throw new Error('ConsultationPackage model not found');
        }

        console.log('ConsultationPackage model loaded');

        // Clear existing packages (optional - comment out to preserve existing)
        // await ConsultationPackage.deleteMany({ tenantId: 'default' });
        // console.log('Cleared existing packages');

        // Insert packages
        let insertedCount = 0;
        let skippedCount = 0;

        for (const pkg of consultationPackages) {
            const existing = await ConsultationPackage.findOne({
                tenantId: pkg.tenantId,
                packageId: pkg.packageId
            });

            if (existing) {
                console.log(`Package ${pkg.packageId} already exists, skipping...`);
                skippedCount++;
                continue;
            }

            const newPackage = new ConsultationPackage(pkg);
            await newPackage.save();
            console.log(`✓ Created package: ${pkg.details.name} (${pkg.packageId})`);
            insertedCount++;
        }

        console.log('\\n===========================================');
        console.log('Seed Summary:');
        console.log(`✓ Inserted: ${insertedCount} packages`);
        console.log(`⊘ Skipped: ${skippedCount} packages (already exist)`);
        console.log('===========================================\\n');

        // Verify packages
        const totalPackages = await ConsultationPackage.countDocuments({ tenantId: 'default' });
        console.log(`Total packages in database: ${totalPackages}`);

        // List all packages
        const packages = await ConsultationPackage.find({ tenantId: 'default' })
            .select('packageId details.name pricing.amount credits.total')
            .sort({ 'availability.displayOrder': 1 });

        console.log('\\nAvailable Packages:');
        packages.forEach(pkg => {
            console.log(`  - ${pkg.details.name}: $${(pkg.pricing.amount / 100).toFixed(2)} (${pkg.credits.total} credits)`);
        });

        // Close connection
        await connectionManager.close();
        console.log('\\nDatabase connection closed');
        console.log('Seed completed successfully!');

        process.exit(0);
    } catch (error) {
        console.error('Error seeding packages:', error);
        process.exit(1);
    }
}

// Run seed
seedPackages();
