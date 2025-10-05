/**
 * @fileoverview AWS S3 Storage Service
 */

const AWS = require('aws-sdk');
const config = require('../../../config');

class S3Service {
    constructor() {
        this.s3 = new AWS.S3({
            accessKeyId: config.integrations.aws.accessKeyId,
            secretAccessKey: config.integrations.aws.secretAccessKey,
            region: config.integrations.aws.region
        });
        this.bucket = config.integrations.aws.s3Bucket;
    }
    
    async uploadFile(key, body, options = {}) {
        const params = {
            Bucket: this.bucket,
            Key: key,
            Body: body,
            ContentType: options.contentType || 'application/octet-stream',
            ...options
        };
        
        try {
            const result = await this.s3.upload(params).promise();
            return {
                success: true,
                url: result.Location,
                key: result.Key
            };
        } catch (error) {
            throw new Error(`S3 upload error: ${error.message}`);
        }
    }
    
    async downloadFile(key) {
        const params = {
            Bucket: this.bucket,
            Key: key
        };
        
        try {
            const result = await this.s3.getObject(params).promise();
            return result.Body;
        } catch (error) {
            throw new Error(`S3 download error: ${error.message}`);
        }
    }
    
    async deleteFile(key) {
        const params = {
            Bucket: this.bucket,
            Key: key
        };
        
        try {
            await this.s3.deleteObject(params).promise();
            return { success: true };
        } catch (error) {
            throw new Error(`S3 delete error: ${error.message}`);
        }
    }
    
    async getSignedUrl(key, operation = 'getObject', expires = 3600) {
        const params = {
            Bucket: this.bucket,
            Key: key,
            Expires: expires
        };
        
        try {
            const url = await this.s3.getSignedUrlPromise(operation, params);
            return url;
        } catch (error) {
            throw new Error(`S3 signed URL error: ${error.message}`);
        }
    }
    
    async listFiles(prefix = '', maxKeys = 1000) {
        const params = {
            Bucket: this.bucket,
            Prefix: prefix,
            MaxKeys: maxKeys
        };
        
        try {
            const result = await this.s3.listObjectsV2(params).promise();
            return result.Contents;
        } catch (error) {
            throw new Error(`S3 list error: ${error.message}`);
        }
    }
}

module.exports = S3Service;
