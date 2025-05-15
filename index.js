const express = require('express');
const AWS = require('aws-sdk');
const multer = require('multer');
const dotenv = require('dotenv').config();
const cors = require('cors');
const crypto = require('crypto');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const stream = require('stream');
ffmpeg.setFfmpegPath(ffmpegPath);

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
      const uploadPromises = req.files.map(async (file) => {
        const fileName = `${crypto.randomBytes(16).toString('hex')}-${
          file.originalname
        }`;
        const params = {
          Bucket: BUCKET_NAME,
          Key: fileName,
          Body: file.buffer,
          ContentType: file.mimetype,
        };
        const uploadResult = await s3.upload(params).promise();

        // Check if file is a video and generate thumbnail
        if (['video/mp4', 'video/quicktime'].includes(file.mimetype)) {
          // Create a readable stream from the buffer
          const bufferStream = new stream.PassThrough();
          bufferStream.end(file.buffer);

          // Generate thumbnail as a buffer
          const thumbBuffer = await new Promise((resolve, reject) => {
            const chunks = [];
            ffmpeg(bufferStream)
              .on('end', () => resolve(Buffer.concat(chunks)))
              .on('error', reject)
              .on('data', (chunk) => chunks.push(chunk))
              .ffprobe((err, metadata) => {
                if (err) return reject(err);
                const { width, height } = metadata.streams[0];
                ffmpeg(bufferStream)
                  .screenshots({
                    count: 1,
                    timemarks: ['1'],
                    size: `${width}x${height}`,
                  })
                  .on('end', () => resolve(Buffer.concat(chunks)))
                  .on('error', reject)
                  .on('data', (chunk) => chunks.push(chunk));
              });
          });

          const thumbName = fileName.replace(/\.[^/.]+$/, '') + '-thumb.jpg';
          await s3
            .upload({
              Bucket: BUCKET_NAME,
              Key: thumbName,
              Body: thumbBuffer,
              ContentType: 'image/jpeg',
            })
            .promise();
        }

        return uploadResult.Location;
      });

      const urls = await Promise.all(uploadPromises);
      res.json(urls);
    } catch (error) {
      console.error(error);
      res.status(500).send('Error uploading wedding photos');
    }
  }
);
