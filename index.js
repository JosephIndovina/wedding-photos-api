const express = require('express');
const AWS = require('aws-sdk');
const multer = require('multer');
const dotenv = require('dotenv').config();
const cors = require('cors');
const crypto = require('crypto');

const BUCKET_NAME = process.env.AWS_BUCKET_NAME;
const API_KEY = process.env.API_KEY;

const app = express();
const port = 3000;
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});
const upload = multer({ storage: multer.memoryStorage() });

const validateApiKey = (req, res, next) => {
  const apiKey = req.header('x-api-key');
  if (apiKey === API_KEY) {
    next();
  } else {
    res.status(403).send('Forbidden: Invalid API Key');
  }
};

const corsOptions = {
  origin: '*',
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

app.get('/weddingPhotos', validateApiKey, async (req, res) => {
  try {
    const data = await s3.listObjectsV2({ Bucket: BUCKET_NAME }).promise();
    const urls = data.Contents.map(
      (item) => `https://${BUCKET_NAME}.s3.amazonaws.com/${item.Key}`
    );
    res.json(urls);
    console.log(urls);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching wedding photos,');
  }
});

app.post(
  '/weddingPhotos',
  validateApiKey,
  upload.array('files'),
  async (req, res) => {
    if (!req.files) {
      return res.status(400).json({ message: 'No files uploaded.' });
    }
    try {
      const uploadPromises = req.files.map((file) => {
        const fileName = `${crypto.randomBytes(16).toString('hex')}-${
          file.originalname
        }`;

        const params = {
          Bucket: BUCKET_NAME,
          Key: fileName,
          Body: file.buffer,
          ContentType: file.mimetype,
        };
        return s3.upload(params).promise();
      });

      const results = await Promise.all(uploadPromises);
      const urls = results.map((result) => result.Location);
      res.json(urls);
    } catch (error) {
      console.error(error);
      res.status(500).send('Error uploading wedding photos');
    }
  }
);
