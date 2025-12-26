// Quick seed script
const mongoose = require("mongoose");
require("dotenv").config();

const consultationPackages = [
    {
        packageId: "PKG-FREE-TRIAL-0001",
        tenantId: "default",
        details: {
            name: "Free Trial Consultation",
            type: "free_trial",
            sku: "FREE-TRIAL-15MIN",
            category: "trial",
            description: "One-time 15-minute complimentary consultation",
            features: ["Initial needs assessment", "Platform walkthrough"]
        },
        credits: { total: 1, duration: { minutes: 15 }, expiresAfterDays: 30 },
        pricing: { amount: 0, currency: "USD" },
        availability: { status: "active", featuredPackage: true, displayOrder: 1 }
    },
    {
        packageId: "PKG-PAY-PER-USE-0001",
        tenantId: "default",
        details: {
            name: "Pay Per Use",
            type: "pay_per_use",
            sku: "PPU-60MIN",
            category: "individual",
            description: "Single 60-minute consultation session",
            features: ["One-on-one consultation", "Follow-up summary"]
        },
        credits: { total: 1, duration: { minutes: 60 }, expiresAfterDays: 90 },
        pricing: { amount: 9900, currency: "USD" },
        availability: { status: "active", featuredPackage: true, displayOrder: 2 }
    },
    {
        packageId: "PKG-STARTER-0001",
        tenantId: "default",
        details: {
            name: "Starter Package",
            type: "consultation_bundle",
            sku: "STARTER-3X60",
            category: "individual",
            description: "3 consultation sessions (60 minutes each)",
            features: ["3 x 60-minute consultations", "Priority scheduling"]
        },
        credits: { total: 3, duration: { minutes: 60 }, expiresAfterDays: 90 },
        pricing: { amount: 29700, currency: "USD" },
        availability: { status: "active", featuredPackage: true, displayOrder: 3 }
    },
    {
        packageId: "PKG-PROFESSIONAL-0001",
        tenantId: "default",
        details: {
            name: "Professional Package",
            type: "consultation_bundle",
            sku: "PRO-5X60",
            category: "business",
            description: "5 consultation sessions - Most Popular",
            features: ["5 x 60-minute consultations", "Dedicated consultant"]
        },
        credits: { total: 5, duration: { minutes: 60 }, expiresAfterDays: 90 },
        pricing: { amount: 45000, currency: "USD", discount: { percentage: 10 } },
        availability: { status: "active", featuredPackage: true, displayOrder: 4 }
    }
];

console.log("Connecting to database...");
mongoose.connect(process.env.DATABASE_CUSTOMER_URI).then(async () => {
    console.log("Connected!");
    const PackageSchema = new mongoose.Schema({}, { strict: false });
    const Package = mongoose.model("ConsultationPackage", PackageSchema, "consultationpackages");

    let inserted = 0;
    for (const pkg of consultationPackages) {
        const exists = await Package.findOne({ packageId: pkg.packageId });
        if (!exists) {
            await Package.create(pkg);
            console.log(`✓ Created: ${pkg.details.name} ($${(pkg.pricing.amount/100).toFixed(2)})`);
            inserted++;
        } else {
            console.log(`⊘ Skipped: ${pkg.details.name} (already exists)`);
        }
    }
    console.log(`\nInserted ${inserted} new packages`);
    const total = await Package.countDocuments();
    console.log(`Total packages in database: ${total}`);
    await mongoose.connection.close();
    process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
