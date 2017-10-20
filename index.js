import { matrixFromJpeg, jpegFromGrayMatrix, dataToJpeg } from './src/jpeg-jsfeat';
import {
  edgeDetect,
  detectCircles,
  colourGaussian,
  getWhiteCoords,
  retinexWhiteBalance,
  detectColours,
} from './src/strip-detect';

// Variables
const filename = './test-files/test4.jpg';

// Run
console.log(filename);
console.log('-----------------------');
const imageMatrix = matrixFromJpeg(filename);
const transformedMatrix = edgeDetect(imageMatrix, 1, 100, 200);
jpegFromGrayMatrix(transformedMatrix, './test-files/edge-detection.jpg');
const circles = detectCircles(transformedMatrix, 10, 60, 130);
const blurredMatrix = colourGaussian(imageMatrix);
dataToJpeg('./test-files/blurred.jpg', blurredMatrix.data, blurredMatrix.cols, blurredMatrix.rows);
const whitePoint = getWhiteCoords(circles);
console.log(whitePoint);
const balancedImageMatrix = retinexWhiteBalance(imageMatrix, whitePoint);
dataToJpeg('./test-files/balanced.jpg', balancedImageMatrix.data, balancedImageMatrix.cols, balancedImageMatrix.rows);
const colours = detectColours(balancedImageMatrix, circles);
console.log(colours);
