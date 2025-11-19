/**
 * @fileoverview Script to upload a test document to S3
 * @description Creates and uploads a test PDF file for document download testing
 * 
 * Usage: node scripts/upload-test-document.js
 */

require('dotenv').config();
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

// Configuration
const BUCKET = process.env.AWS_S3_BUCKET || 'insightserenity-ap';
const REGION = process.env.AWS_DEFAULT_REGION || 'ap-southeast-1';

// S3 Client
const s3Client = new S3Client({
    region: REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

// Test document path - this matches what's in your database
const TEST_DOCUMENT_KEY = 'reports/2024/architecture-review-nov.pdf';

async function uploadTestDocument() {
    console.log('='.repeat(60));
    console.log('Test Document Upload Script');
    console.log('='.repeat(60));
    console.log(`Bucket: ${BUCKET}`);
    console.log(`Region: ${REGION}`);
    console.log(`Key: ${TEST_DOCUMENT_KEY}`);
    console.log('='.repeat(60));

    try {
        // Check if file already exists
        try {
            const headCommand = new HeadObjectCommand({
                Bucket: BUCKET,
                Key: TEST_DOCUMENT_KEY
            });
            await s3Client.send(headCommand);
            console.log('\nFile already exists in S3. Skipping upload.');
            console.log(`URL: https://${BUCKET}.s3.${REGION}.amazonaws.com/${TEST_DOCUMENT_KEY}`);
            return;
        } catch (headError) {
            if (headError.name !== 'NotFound') {
                throw headError;
            }
            console.log('\nFile does not exist. Proceeding with upload...');
        }

        // Create a simple test PDF content
        const testPdfContent = createTestPdfContent();

        // Upload to S3
        const putCommand = new PutObjectCommand({
            Bucket: BUCKET,
            Key: TEST_DOCUMENT_KEY,
            Body: testPdfContent,
            ContentType: 'application/pdf',
            Metadata: {
                'uploaded-by': 'test-script',
                'uploaded-at': new Date().toISOString(),
                'purpose': 'document-download-testing'
            }
        });

        console.log('Uploading test document...');
        const result = await s3Client.send(putCommand);
        
        console.log('\nUpload successful!');
        console.log(`ETag: ${result.ETag}`);
        console.log(`URL: https://${BUCKET}.s3.${REGION}.amazonaws.com/${TEST_DOCUMENT_KEY}`);

        // Verify upload
        const verifyCommand = new HeadObjectCommand({
            Bucket: BUCKET,
            Key: TEST_DOCUMENT_KEY
        });
        const verifyResult = await s3Client.send(verifyCommand);
        
        console.log('\nVerification:');
        console.log(`  Content-Type: ${verifyResult.ContentType}`);
        console.log(`  Content-Length: ${verifyResult.ContentLength} bytes`);
        console.log(`  Last-Modified: ${verifyResult.LastModified}`);

        console.log('\n' + '='.repeat(60));
        console.log('Test document uploaded successfully!');
        console.log('You can now test the document download functionality.');
        console.log('='.repeat(60));

    } catch (error) {
        console.error('\nUpload failed with error:', error.message);
        
        if (error.name === 'NoSuchBucket') {
            console.error(`\nThe bucket "${BUCKET}" does not exist.`);
            console.error('Please create the bucket in AWS S3 console first.');
        } else if (error.name === 'AccessDenied') {
            console.error('\nAccess denied. Please check your AWS credentials and IAM permissions.');
            console.error('Required permissions: s3:PutObject, s3:GetObject, s3:ListBucket');
        } else {
            console.error(error.stack);
        }
    }
}

/**
 * Create simple test PDF content
 * This creates a minimal valid PDF file
 */
function createTestPdfContent() {
    const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 280 >>
stream
BT
/F1 24 Tf
100 700 Td
(InsightSerenity Platform) Tj
0 -40 Td
/F1 16 Tf
(System Architecture Review Report) Tj
0 -30 Td
(November 2024) Tj
0 -50 Td
/F1 12 Tf
(This is a test document for download functionality testing.) Tj
0 -20 Td
(Document ID: DOC-MI5KTNG23945F357) Tj
0 -20 Td
(Generated: ${new Date().toISOString()}) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000598 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
675
%%EOF`;

    return Buffer.from(pdfContent);
}

// Run the script
uploadTestDocument();