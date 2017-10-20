import * as clusterMaker from 'clusters';
import glur from 'glur';
import * as jsfeat from 'jsfeat';

function formatPixel(val) {
  let newVal = Math.round(val);
  newVal = newVal > 255 ? 255 : newVal;
  newVal = newVal < 0 ? 0 : newVal;
  return newVal;
}

// Pass a colour jsfeat matrix_t. Returns a grayscale jsfeat matrix_t with edge
// detection transforms applied.
export const edgeDetect = (imageMatrix, gaussianBlurRadius, cannyMinThreshold, cannyMaxThreshold) => {
  // Create empty grayscale matrix
  const transformedMatrix = new jsfeat.matrix_t(
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
    jsfeat.COLOR_RGBA2GRAY,
  );

  // Apply a gaussian blur
  jsfeat.imgproc.gaussian_blur(transformedMatrix, transformedMatrix, undefined, gaussianBlurRadius);

  // Apply a canny filter
  jsfeat.imgproc.canny(transformedMatrix, transformedMatrix, cannyMinThreshold, cannyMaxThreshold);

  return transformedMatrix;
};

// Pass a grayscale jsfeat matrix_t. Returns an array of circles.
export const detectCircles = (imageMatrix, minRadius, maxRadius, houghThreshold) => {
  // Initialize empty 3 dimensional Hough accumulator array
  const hough = [];
  for (let a = 0; a < imageMatrix.cols; a += 1) {
    hough[a] = [];
    for (let b = 0; b < imageMatrix.rows; b += 1) {
      hough[a][b] = [];
      for (let r = minRadius; r <= maxRadius; r += 1) {
        hough[a][b][r] = 0;
      }
    }
  }

  // Do the hough voting
  // See: https://www.cis.rit.edu/class/simg782/lectures/lecture_10/lec782_05_10.pdf
  // Also see: https://en.wikipedia.org/wiki/Circle_Hough_Transform
  imageMatrix.data.forEach((pixel, index) => {
    if (pixel !== 0) { // If pixel is not black, i.e. an edge
      const x = index % imageMatrix.cols;
      const y = Math.floor(index / imageMatrix.cols);
      for (let r = minRadius; r < maxRadius; r += 1) {
        for (let t = 0; t < 360; t += 1) { // the possible  theta 0 to 360
          const a = x - Math.round(r * Math.cos(t * Math.PI / 180)); // polar coordinate for center
          const b = y - Math.round(r * Math.sin(t * Math.PI / 180)); // polar coordinate for center
          if (hough[a] && hough[a][b]) { // Don't accumulate points that are outside of the image
            hough[a][b][r] += 1;
          }
        }
      }
    }
  });

  // Voting is done, save the best candidate points
  const points = [];
  for (let a = 0; a < imageMatrix.cols; a += 1) {
    for (let b = 0; b < imageMatrix.rows; b += 1) {
      for (let r = minRadius; r <= maxRadius; r += 1) {
        if (hough[a][b][r] > houghThreshold) {
          points.push([a, b, r]);
        }
      }
    }
  }

  // Cluster the votes around two circles
  clusterMaker.k(2);
  clusterMaker.data(points);
  const clusters = clusterMaker.clusters();
  const circles = clusters.map(cluster => cluster.centroid);
  return circles;
};

// Pass a colour jsfeat matrix_t and an array of circles. Returns an array of colours
export const detectColours = (imageMatrix, circleAr) => {
  // Get the colour at the center of each circle
  const colours = circleAr.map((circle) => {
    const x = Math.round(circle[0]);
    const y = Math.round(circle[1]);
    const pixelIndex = (y * imageMatrix.cols) + x;
    return {
      x,
      y,
      radius: circle[2],
      red: imageMatrix.data[4 * pixelIndex],
      green: imageMatrix.data[(4 * pixelIndex) + 1],
      blue: imageMatrix.data[(4 * pixelIndex) + 2],
    };
  });

  return colours;
};

export const colourGaussian = (imageMatrix) => {
  glur(imageMatrix.data, imageMatrix.cols, imageMatrix.rows, 3);
  return imageMatrix;
};

// Find a white pixel by looking at where the big circle and little circle are, 
// and tracing a line a bit further past the big circle
export const getWhiteCoords = (circles) => {
  let bigCircle;
  let smallCircle;

  // Figure out which circle is biggest
  if (circles[0][2] > circles[1][2]) {
    [bigCircle, smallCircle] = circles;
  } else {
    [smallCircle, bigCircle] = circles;
  }

  // Calculate distance
  const distance = Math.sqrt(((bigCircle[0] - smallCircle[0]) ** 2) +
    ((bigCircle[1] - smallCircle[1]) ** 2));

  // Calculate the ratio for the point just past the big circle
  const t = (distance + bigCircle[2] + bigCircle[2]) / distance;

  // Calculate a point down the line according to the ratio we found above
  const whitePoint = {
    x: Math.round(((1 - t) * smallCircle[0]) + (t * bigCircle[0])),
    y: Math.round(((1 - t) * smallCircle[1]) + (t * bigCircle[1])),
  };

  return whitePoint;
};

// Pass in a colour jsfeat matrix_t and a white pixel's coordinate {x,y},
// returns a colour jsfeat matrix_t
export const retinexWhiteBalance = (imageMatrix, whiteCoord) => {
  // Get red, green and blue pixel values at white Coord
  const pixelIndex = (whiteCoord.y * imageMatrix.cols) + whiteCoord.x;
  const maxR = imageMatrix.data[pixelIndex * 4];
  const maxG = imageMatrix.data[(pixelIndex * 4) + 1];
  const maxB = imageMatrix.data[(pixelIndex * 4) + 2];

  // Calculate corrected ratios for red and blue
  const corrR = 255 / maxR;
  const corrG = 255 / maxG;
  const corrB = 255 / maxB;

  // Build a new data array with corrected vals
  const correctedBits = new Uint8Array(imageMatrix.data.length);
  for (let i = 0; i < imageMatrix.data.length; i+=4) {
    correctedBits[i] = formatPixel(imageMatrix.data[i] * corrR); // red
    correctedBits[i + 1] = formatPixel(imageMatrix.data[i + 1] * corrG); // red
    correctedBits[i + 2] = formatPixel(imageMatrix.data[i + 2] * corrB); // blue
    correctedBits[i + 3] = 0xFF; // alpha - ignored in JPEGs
  }

  // Make a new matrix for returning
  const newImageMatrix = new jsfeat.matrix_t(
    imageMatrix.cols,
    imageMatrix.rows,
    jsfeat.U8_t | jsfeat.C1_t
  );
  newImageMatrix.data = correctedBits;
  newImageMatrix.channel = 4;
  return newImageMatrix;
};
