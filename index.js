// Dependencies
const jpeg = require('jpeg-js');
const fs = require('fs');
const jsfeat = require('jsfeat');
const clusterMaker = require('clusters');
const glur = require('glur');

// Variables
const filename = './test-files/test3.jpg'

// Run
console.log(filename);
console.log('-----------------------');
let imageMatrix = matrixFromJpeg(filename);
let transformedMatrix = edgeDetect(imageMatrix, 1, 100, 200);
jpegFromMatrix(transformedMatrix, './test-files/edge-detection.jpg');
let circles = detectCircles(transformedMatrix, 10, 60, 130);
imageMatrix = colourGaussian(imageMatrix);
let whitePoint = getWhiteCoords(circles);
console.log(whitePoint);
let balancedImageMatrix = retinexWhiteBalance(imageMatrix, whitePoint);
let colours = detectColours(balancedImageMatrix, circles);
console.log(colours);

// Pass a filename. Returns a jsfeat matrix representation of that image.
function matrixFromJpeg(filename) {
  // Read in jpeg from file
  const jpegData = fs.readFileSync(filename);
  const rawImageData = jpeg.decode(jpegData, true); // return as Uint8Array

  // Make an empty matrix to store the image for manipulation
  let imageMatrix = new jsfeat.matrix_t(
    rawImageData.width,
    rawImageData.height,
    jsfeat.U8_t | jsfeat.C1_t
  );
  imageMatrix.data = rawImageData.data;
  imageMatrix.channel = 4;
  return imageMatrix;
}

// Pass a colour jsfeat matrix_t. Returns a grayscale jsfeat matrix_t with edge detection transforms applied.
function edgeDetect(imageMatrix, gaussianBlurRadius, cannyMinThreshold, cannyMaxThreshold) {
  // Create empty grayscale matrix
  let transformedMatrix = new jsfeat.matrix_t(
    imageMatrix.cols,
    imageMatrix.rows,
    jsfeat.U8_t | jsfeat.C1_t
  );

  // Convert to grayscale and save in matrix
  jsfeat.imgproc.grayscale(
    imageMatrix.data,
    imageMatrix.cols,
    imageMatrix.rows,
    transformedMatrix,
    jsfeat.COLOR_RGBA2GRAY
  );

  // Apply a gaussian blur
  jsfeat.imgproc.gaussian_blur(transformedMatrix, transformedMatrix, undefined, gaussianBlurRadius);

  // Apply a canny filter
  jsfeat.imgproc.canny(transformedMatrix, transformedMatrix, cannyMinThreshold, cannyMaxThreshold);

  return transformedMatrix;
}

// Pass a grayscale jsfeat matrix_t. Returns an array of circles.
function detectCircles(imageMatrix, minRadius, maxRadius, houghThreshold) {
  // Initialize empty 3 dimensional Hough accumulator array
  let hough = [];
  for (let a = 0; a < imageMatrix.cols; a++) {
    hough[a] = [];
    for (let b = 0; b < imageMatrix.rows; b++) {
      hough[a][b] = [];
      for(let r = minRadius; r <= maxRadius; r++){
        hough[a][b][r] = 0;
      }
    }
  }

  // Do the hough voting
  // See: https://www.cis.rit.edu/class/simg782/lectures/lecture_10/lec782_05_10.pdf
  // Also see: https://en.wikipedia.org/wiki/Circle_Hough_Transform
  imageMatrix.data.forEach( (pixel, index) => {
    if (pixel !== 0) { // If pixel is not black, i.e. an edge
      const x = index % imageMatrix.cols;
      const y = Math.floor(index / imageMatrix.cols);
      for (let r = minRadius; r < maxRadius; r++){
        for (let t = 0; t < 360; t++) { // the possible  theta 0 to 360 
          const a = x - Math.round(r * Math.cos(t * Math.PI / 180)); //polar coordinate for center
          const b = y - Math.round(r * Math.sin(t * Math.PI / 180)); //polar coordinate for center
          if(hough[a] && hough[a][b]){ // Don't accumulate points that are outside of the image
            hough[a][b][r] += 1;
          }
        }
      }
    }
  });

  // Voting is done, save the best candidate points
  let points = [];
  for (let a = 0; a < imageMatrix.cols; a++) {
    for (let b = 0; b < imageMatrix.rows; b++) {
      for(let r = minRadius; r <= maxRadius; r++){
        if(hough[a][b][r] > houghThreshold){
          points.push([a, b, r]);
        }
      }
    }
  }

  // Cluster the votes around two circles
  clusterMaker.k(2);
  clusterMaker.data(points);
  let clusters = clusterMaker.clusters();
  let circles = clusters.map((cluster) => cluster.centroid);
  return circles;
}

// Pass a colour jsfeat matrix_t and an array of circles. Returns an array of colours
function detectColours (imageMatrix, circleAr) {
  // Get the colour at the center of each circle
  const colours = circleAr.map((circle) => {
    const x = Math.round(circle[0]);
    const y = Math.round(circle[1]);
    const pixelIndex = (y * imageMatrix.cols) + x;
    return {
      x: x,
      y: y,
      radius: circle[2],
      red: imageMatrix.data[4*pixelIndex],
      green: imageMatrix.data[4*pixelIndex+1],
      blue: imageMatrix.data[4*pixelIndex+2],
    };
  });

  saveAsJpeg('test-files/gaussian-blur.jpg', imageMatrix.data, imageMatrix.cols, imageMatrix.rows);

  return colours;
}

// Pass a grayscale jsfeat matrix_t and a filename. Encodes the matrix as a jpeg and saves to file.
function jpegFromMatrix(imageMatrix, filename) {
  // Encode JPEG again
  let frameData = new Buffer(imageMatrix.cols * imageMatrix.rows * 4); // Assumes grayscale
  for (let i = 0; i < imageMatrix.data.length; i++) {
    frameData[4*i] = imageMatrix.data[i]; // red 
    frameData[4*i+1] = imageMatrix.data[i]; // green 
    frameData[4*i+2] = imageMatrix.data[i]; // blue 
    frameData[4*i+3] = 0xFF; // alpha - ignored in JPEGs 
  }

  saveAsJpeg(filename, frameData, imageMatrix.cols, imageMatrix.rows);
}

function saveAsJpeg(filename, data, width, height) {
  const outputRawImageData = {
    data: data,
    width: width,
    height: height,
  };

  const outputEncodedData = jpeg.encode(outputRawImageData, 90);

  try{
    fs.unlinkSync(filename);
    console.log(`${filename} deleted`);
  } catch (e) {
    console.log(`${filename} does not exist`);
  }

  fs.writeFile(filename, outputEncodedData.data, 'binary', function(err) {
    if(err) {
      return console.log(err);
    }
    console.log(`${filename} saved`);
  });
}

function colourGaussian (imageMatrix) {
  glur(imageMatrix.data, imageMatrix.cols, imageMatrix.rows, 3);
  return imageMatrix;
}

// Find a white pixel by looking at where the big circle and little circle are, and tracing a line a bit further past the big circle
function getWhiteCoords (circles) {
  
  let bigCircle, smallCircle;

  // Figure out which circle is biggest
  if( circles[0][2] > circles[1][2] ){
    bigCircle = circles[0];
    smallCircle = circles[1];
  } else {
    bigCircle = circles[1];
    smallCircle = circles[0];
  }
  
  // Calculate slope ([0] is x, [1] is y)
  const slope = (bigCircle[1] - smallCircle[1]) / (bigCircle[0] - smallCircle[0])

  // Calculate distance
  const distance = Math.sqrt(Math.pow((bigCircle[0] - smallCircle[0]), 2) + Math.pow((bigCircle[1] - smallCircle[1]), 2))

  // Calculate the ratio for the point just past the big circle
  const t = (distance + bigCircle[2] + bigCircle[2]) / distance;

  // Calculate a point down the line according to the ratio we found above
  const whitePoint = {
    x: Math.round( ((1 - t) * smallCircle[0]) + (t * bigCircle[0]) ),
    y: Math.round( ((1 - t) * smallCircle[1]) + (t * bigCircle[1]) ),
  }

  return whitePoint;
}

// Pass in a colour jsfeat matrix_t and a white pixel's coordinate {x,y}, returns a colour jsfeat matrix_t
function retinexWhiteBalance (imageMatrix, whiteCoord) {
  // Get red, green and blue pixel values at white Coord
  const pixelIndex = (whiteCoord.y * imageMatrix.cols) + whiteCoord.x;
  console.log('pixelIndex: ' + pixelIndex);
  const maxR = imageMatrix.data[pixelIndex * 4];
  const maxG = imageMatrix.data[pixelIndex * 4 + 1];
  const maxB = imageMatrix.data[pixelIndex * 4 + 2];

  // Calculate corrected ratios for red and blue
  const corrR = 255 / maxR;
  const corrG = 255 / maxG;
  const corrB = 255 / maxB;

  console.log('corrR: ' + corrR);
  console.log('corrB: ' + corrB);

  // Build a new data array with corrected vals
  let correctedBits = new Uint8Array(imageMatrix.data.length);
  for (let i = 0; i < imageMatrix.data.length; i+=4) {
    correctedBits[i] = rAndM(imageMatrix.data[i] * corrR); // red
    correctedBits[i+1] = rAndM(imageMatrix.data[i+1] * corrG); // red
    correctedBits[i+2] = rAndM(imageMatrix.data[i+2] * corrB); // blue
    correctedBits[i+3] = 0xFF; // alpha - ignored in JPEGs
  }

  // Make a new matrix for returning
  let newImageMatrix = new jsfeat.matrix_t(
    imageMatrix.cols,
    imageMatrix.rows,
    jsfeat.U8_t | jsfeat.C1_t
  );
  newImageMatrix.data = correctedBits;
  newImageMatrix.channel = 4;
  return newImageMatrix;
}

function rAndM (val) {
  val = Math.round(val);
  val = val > 255 ? 255 : val;
  val = val < 0 ? 0 : val;
  return val;
}
