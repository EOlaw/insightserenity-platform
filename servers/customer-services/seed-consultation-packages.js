const mongoose = require('mongoose');

// Force use of production database - don't use .env
const MONGO_URI = 'mongodb+srv://EOlaw146:Olawalee_.146@cluster0.4wv68hn.mongodb.net/insightserenity_customer_dev?retryWrites=true&w=majority&appName=Cluster0';

const packages = [
  {
    packageId: 'PKG-FREE-TRIAL',
    tenantId: 'default',
    organizationId: '000000000000000000000002',
    details: {
      name: 'Free Trial Consultation',
      type: 'free_trial',
      sku: 'CONS-FREE-TRIAL',
      category: 'trial',
      description: 'Complimentary 15-minute consultation to explore how our strategic advisory services can benefit your organization. Perfect for first-time clients to experience our expertise.',
      features: [
        '15-minute complimentary consultation',
        'Initial needs assessment',
        'Overview of our consulting services',
        'Preliminary recommendations',
        'No credit card required',
        'One-time offer for new organizations',
        'Valid for 30 days from account creation'
      ]
    },
    credits: {
      total: 1,
      duration: {
        minutes: 15
      },
      expiresAfterDays: 30
    },
    pricing: {
      amount: 0,
      currency: 'USD'
    },
    availability: {
      status: 'active',
      featuredPackage: true,
      displayOrder: 0
    },
    metadata: {
      targetAudience: 'new_clients',
      eligibility: {
        oneTimeOnly: true,
        requiresVerification: true,
        autoAssignOnRegistration: true
      },
      recommendedFor: 'New organizations exploring our services'
    }
  },
  {
    packageId: 'PKG-DISCOVERY-ASSESSMENT',
    tenantId: 'default',
    organizationId: '000000000000000000000002',
    details: {
      name: 'Discovery & Assessment Program',
      type: 'consultation_bundle',
      sku: 'CONS-DISCOVERY-001',
      category: 'assessment',
      description: 'Comprehensive organizational assessment and strategic roadmap development. Ideal for institutions and companies seeking clarity on their current state and future direction.',
      features: [
        '4 strategic consultation sessions (90 minutes each)',
        'In-depth organizational capability assessment',
        'Stakeholder interviews and needs analysis',
        'Current state analysis and gap identification',
        'Detailed assessment report with findings',
        'Strategic recommendations and roadmap',
        'Executive summary presentation',
        'Priority action items with timeline',
        '30-day email support post-delivery',
        'Valid for 60 days from engagement start'
      ]
    },
    credits: {
      total: 4,
      duration: {
        minutes: 90
      },
      expiresAfterDays: 60
    },
    pricing: {
      amount: 4500.00,
      currency: 'USD'
    },
    availability: {
      status: 'active',
      featuredPackage: true,
      displayOrder: 1
    },
    metadata: {
      targetAudience: 'colleges_companies',
      deliverables: ['Assessment Report', 'Strategic Roadmap', 'Executive Presentation'],
      recommendedFor: 'Organizations starting their transformation journey'
    }
  },
  {
    packageId: 'PKG-STRATEGIC-PLANNING',
    tenantId: 'default',
    organizationId: '000000000000000000000002',
    details: {
      name: 'Strategic Planning & Implementation',
      type: 'consultation_bundle',
      sku: 'CONS-STRATEGIC-002',
      category: 'strategic',
      description: 'Comprehensive strategic planning engagement with implementation framework. Perfect for organizations ready to execute on their vision with expert guidance.',
      features: [
        '8 strategic planning sessions (120 minutes each)',
        'Vision and mission alignment workshops',
        'Strategic objectives and KPI definition',
        'Implementation framework development',
        'Change management strategy',
        'Resource planning and allocation guidance',
        'Risk assessment and mitigation planning',
        'Comprehensive strategic plan document',
        'Implementation playbook with phase breakdown',
        'Quarterly review sessions (3 included)',
        '90-day email and phone support',
        'Valid for 120 days from engagement start'
      ]
    },
    credits: {
      total: 8,
      duration: {
        minutes: 120
      },
      expiresAfterDays: 120
    },
    pricing: {
      amount: 12500.00,
      currency: 'USD'
    },
    availability: {
      status: 'active',
      featuredPackage: true,
      displayOrder: 2
    },
    metadata: {
      targetAudience: 'companies_enterprises',
      deliverables: ['Strategic Plan', 'Implementation Playbook', 'KPI Framework', 'Change Management Strategy'],
      recommendedFor: 'Mid-size companies and college institutions planning major initiatives'
    }
  },
  {
    packageId: 'PKG-TRANSFORMATION-PARTNER',
    tenantId: 'default',
    organizationId: '000000000000000000000002',
    details: {
      name: 'Transformation Partnership Program',
      type: 'consultation_bundle',
      sku: 'CONS-TRANSFORM-003',
      category: 'transformation',
      description: 'Full-scale transformation partnership for organizations undertaking significant change initiatives. Includes strategy, implementation support, and ongoing advisory.',
      features: [
        '12 deep-dive consultation sessions (120 minutes each)',
        'Dedicated senior consultant and subject matter experts',
        'Transformation strategy and roadmap',
        'Process redesign and optimization',
        'Technology assessment and recommendations',
        'Organizational design and restructuring guidance',
        'Training and capability building for leadership team',
        'Implementation support and progress tracking',
        'Monthly steering committee sessions',
        'Comprehensive documentation and knowledge transfer',
        'Priority access to consulting team',
        'Unlimited email support for 6 months',
        'Valid for 180 days from engagement start'
      ]
    },
    credits: {
      total: 12,
      duration: {
        minutes: 120
      },
      expiresAfterDays: 180
    },
    pricing: {
      amount: 24900.00,
      currency: 'USD'
    },
    availability: {
      status: 'active',
      featuredPackage: true,
      displayOrder: 3
    },
    metadata: {
      targetAudience: 'enterprises',
      deliverables: ['Transformation Strategy', 'Process Documentation', 'Training Materials', 'Progress Reports'],
      recommendedFor: 'Large organizations and enterprises undergoing major transformation'
    }
  },
  {
    packageId: 'PKG-QUARTERLY-ADVISORY',
    tenantId: 'default',
    organizationId: '000000000000000000000002',
    details: {
      name: 'Quarterly Advisory Retainer',
      type: 'consultation_bundle',
      sku: 'CONS-RETAINER-Q1',
      category: 'retainer',
      description: 'Ongoing strategic advisory partnership with flexible consultation hours and continuous support. Ideal for organizations requiring regular expert guidance.',
      features: [
        '16 flexible consultation hours per quarter',
        'Sessions can be scheduled as 60, 90, or 120-minute blocks',
        'Dedicated account manager',
        'Strategic advisory on demand',
        'Best practice guidance and industry insights',
        'Review and feedback on initiatives and proposals',
        'Monthly check-in calls (30 minutes)',
        'Access to consultant network and resources',
        'Priority scheduling and rapid response',
        'Quarterly business review with executive summary',
        'Unlimited email correspondence',
        'Auto-renews quarterly, cancel anytime'
      ]
    },
    credits: {
      total: 16,
      duration: {
        minutes: 60
      },
      expiresAfterDays: 90
    },
    pricing: {
      amount: 8900.00,
      currency: 'USD'
    },
    availability: {
      status: 'active',
      featuredPackage: false,
      displayOrder: 4
    },
    metadata: {
      targetAudience: 'companies_enterprises',
      deliverables: ['Quarterly Business Review', 'Advisory Reports', 'Strategic Recommendations'],
      recommendedFor: 'Organizations seeking ongoing strategic partnership',
      isRecurring: true,
      billingCycle: 'quarterly'
    }
  },
  {
    packageId: 'PKG-ANNUAL-PARTNERSHIP',
    tenantId: 'default',
    organizationId: '000000000000000000000002',
    details: {
      name: 'Annual Strategic Partnership',
      type: 'consultation_bundle',
      sku: 'CONS-RETAINER-Y1',
      category: 'retainer',
      description: 'Comprehensive year-long strategic partnership providing unlimited advisory access, implementation support, and executive coaching for sustainable organizational excellence.',
      features: [
        '80 consultation hours annually (flexible scheduling)',
        'Unlimited strategic advisory access',
        'Dedicated senior partner and consulting team',
        'Monthly strategic planning sessions',
        'Quarterly business reviews and presentations',
        'Annual strategic planning workshop (full day)',
        'Implementation support and project oversight',
        'Executive coaching for leadership team',
        'Change management and organizational development',
        'Industry benchmark analysis and competitive insights',
        'Thought leadership and innovation sessions',
        'Crisis support and rapid response',
        'Full documentation and knowledge management',
        'Priority access to all firm resources',
        '24/7 emergency advisory line',
        'Valid for 365 days with auto-renewal option'
      ]
    },
    credits: {
      total: 80,
      duration: {
        minutes: 60
      },
      expiresAfterDays: 365
    },
    pricing: {
      amount: 32900.00,
      currency: 'USD',
      discount: {
        percentage: 8,
        reason: 'Annual commitment discount'
      }
    },
    availability: {
      status: 'active',
      featuredPackage: true,
      displayOrder: 5
    },
    metadata: {
      targetAudience: 'enterprises',
      deliverables: ['Annual Strategic Plan', 'Quarterly Reviews', 'Monthly Reports', 'Workshop Materials'],
      recommendedFor: 'Enterprises requiring comprehensive strategic partnership',
      isRecurring: true,
      billingCycle: 'annual'
    }
  },
  {
    packageId: 'PKG-WORKSHOP-TRAINING',
    tenantId: 'default',
    organizationId: '000000000000000000000002',
    details: {
      name: 'Executive Workshop & Training Program',
      type: 'consultation_bundle',
      sku: 'CONS-WORKSHOP-004',
      category: 'training',
      description: 'Customized executive workshops and leadership training programs designed to build organizational capability and drive sustainable change.',
      features: [
        '6 interactive workshop sessions (3 hours each)',
        'Customized curriculum based on organizational needs',
        'Leadership development and executive coaching',
        'Team-building and collaboration exercises',
        'Case studies and real-world applications',
        'Skills assessment and development planning',
        'Participant workbooks and training materials',
        'Post-workshop reinforcement sessions',
        'Individual coaching sessions for executives',
        'Progress tracking and effectiveness measurement',
        'Certificate of completion for participants',
        '60-day follow-up support',
        'Valid for 90 days from program start'
      ]
    },
    credits: {
      total: 6,
      duration: {
        minutes: 180
      },
      expiresAfterDays: 90
    },
    pricing: {
      amount: 9800.00,
      currency: 'USD'
    },
    availability: {
      status: 'active',
      featuredPackage: false,
      displayOrder: 6
    },
    metadata: {
      targetAudience: 'colleges_companies_enterprises',
      deliverables: ['Training Materials', 'Participant Workbooks', 'Assessment Reports', 'Certificates'],
      recommendedFor: 'Organizations investing in leadership development',
      maxParticipants: 25
    }
  }
];

async function seedPackages() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    const dbName = mongoose.connection.db.databaseName;
    console.log(`✅ Connected to MongoDB`);
    console.log(`📊 Database: ${dbName}\n`);

    // Define Package schema - explicitly specify collection name
    const PackageSchema = new mongoose.Schema({}, { strict: false });
    const Package = mongoose.models.ConsultationPackage || mongoose.model('ConsultationPackage', PackageSchema, 'consultationpackages');

    // Clear existing packages
    console.log('🗑️  Clearing existing packages...');
    const deleteResult = await Package.deleteMany({
      tenantId: { $in: ['default', 'insight-serenity'] }
    });
    console.log(`   Deleted ${deleteResult.deletedCount} existing packages\n`);

    // Insert new packages
    console.log('📦 Inserting consultation packages...\n');

    for (const pkg of packages) {
      const created = await Package.create({
        ...pkg,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      console.log(`✅ Created: ${pkg.details.name}`);
      console.log(`   Package ID: ${pkg.packageId}`);
      console.log(`   Type: ${pkg.details.type}`);
      console.log(`   Price: $${pkg.pricing.amount}`);
      console.log(`   Credits: ${pkg.credits.total} session(s) × ${pkg.credits.duration.minutes} min`);
      if (pkg.pricing.discount) {
        console.log(`   Discount: ${pkg.pricing.discount.percentage}% off`);
      }
      console.log('');
    }

    // Summary - verify with direct collection query
    console.log('\n🔍 Verifying packages...');
    const db = mongoose.connection.db;
    const packagesCollection = db.collection('consultationpackages');
    const directCount = await packagesCollection.countDocuments({});
    const totalPackages = await Package.countDocuments({});

    console.log(`   Via Model query: ${totalPackages}`);
    console.log(`   Via Direct collection query: ${directCount}`);

    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║       ENTERPRISE PACKAGE SEEDING COMPLETED!              ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');
    console.log(`📊 Total packages in database: ${directCount}`);
    console.log('\nEnterprise Package Portfolio:');
    console.log('  • Free Trial Consultation - $0 (15 min)');
    console.log('  • Discovery & Assessment Program - $4,500');
    console.log('  • Strategic Planning & Implementation - $12,500');
    console.log('  • Transformation Partnership Program - $24,900');
    console.log('  • Quarterly Advisory Retainer - $8,900');
    console.log('  • Annual Strategic Partnership - $32,900');
    console.log('  • Executive Workshop & Training Program - $9,800');
    console.log('\n✨ All packages are active and available for enterprise clients!');

    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed.');

  } catch (error) {
    console.error('\n❌ Error seeding packages:', error);
    process.exit(1);
  }
}

// Run the seeding
seedPackages();
