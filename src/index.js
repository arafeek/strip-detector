import express from 'express';
import bodyParser from 'body-parser';
import { matrixFromBase64, jpegFromGrayMatrix, dataToJpeg } from './jpeg-jsfeat';
import {
  edgeDetect,
  detectCircles,
  colourGaussian,
  getWhiteCoords,
  retinexWhiteBalance,
  detectColour,
} from './strip-detect';

/*
 * @param: Buffer
 * @return: Promise
 */
function getColours(image) {
  const timestamp = new Date().getTime();
  const imageMatrix = matrixFromBase64(image);
  const transformedMatrix = edgeDetect(imageMatrix, 1, 100, 200);
  const circles = detectCircles(transformedMatrix, 10, 60, 130);
  const blurredMatrix = colourGaussian(imageMatrix);
  const whitePoint = getWhiteCoords(circles);
  const balancedImageMatrix = retinexWhiteBalance(blurredMatrix, whitePoint);
  const colours = detectColour(balancedImageMatrix, circles);

  return Promise.all([
    jpegFromGrayMatrix(transformedMatrix, `edge-detection-${timestamp}.jpg`),
    dataToJpeg(`blurred-${timestamp}.jpg`, blurredMatrix.data, blurredMatrix.cols, blurredMatrix.rows),
    dataToJpeg(`balanced-${timestamp}.jpg`, balancedImageMatrix.data, balancedImageMatrix.cols, balancedImageMatrix.rows),
    colours,
  ]);
}

// Spin up simple express web server
const app = express();

app.use(bodyParser.urlencoded({ extended: false, limit: '50mb' }));
app.use(bodyParser.json({limit: '50mb'}));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

app.post('/detect-colour', (req, res) => {
  console.log('/detect-colour');

  const { image, width, height } = req.body; // base64 encoded string
  if (typeof image === 'undefined') {
    res.json({ error: 'You must send an image.' });
    return;
  }

  getColours(image, width, height)
    .then(([edgeJpeg, blurredJpeg, balancedJpeg, colour]) => res.send({
      edgeJpeg,
      blurredJpeg,
      balancedJpeg,
      colour,
    }))
    .catch(() => res.json({ error: 'There was an error handling your request.' }));
});

app.use(express.static('public'));

app.listen(6868, () => {
  console.log('Server listening on port 6868');
});
