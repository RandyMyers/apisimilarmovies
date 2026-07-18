/**
 * Vercel Serverless Function Entry Point
 */
process.env.VERCEL = '1';
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const app = require('../app');
module.exports = app;
