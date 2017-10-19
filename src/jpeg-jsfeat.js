const jpeg = require('jpeg-js');
const fs = require('fs');
const jsfeat = require('jsfeat');

export const dataToJpeg = (filename, data, width, height) => {
  const outputRawImageData = {
    data,
    width,
    height,
  };

  const outputEncodedData = jpeg.encode(outputRawImageData, 90);

  try {
    fs.unlinkSync(filename);
    console.log(`${filename} deleted`);
  } catch (e) {
    console.log(`${filename} does not exist`);
  }

  fs.writeFile(filename, outputEncodedData.data, 'binary', (err) => {
    if (err) {
      return console.log(err);
    }
    console.log(`${filename} saved`);
  });
};

// Pass a filename. Returns a jsfeat matrix representation of that image.
export const matrixFromJpeg = (filename) => {
  // Read in jpeg from file
  const jpegData = fs.readFileSync(filename);
  const rawImageData = jpeg.decode(jpegData, true); // return as Uint8Array

  // Make an empty matrix to store the image for manipulation
  const imageMatrix = new jsfeat.matrix_t(
    rawImageData.width,
    rawImageData.height,
    jsfeat.U8_t | jsfeat.C1_t,
  );
  imageMatrix.data = rawImageData.data;
  imageMatrix.channel = 4;
  return imageMatrix;
};

// Pass a grayscale jsfeat matrix_t and a filename. Encodes the matrix as a jpeg and saves to file.
export const jpegFromGrayMatrix = (imageMatrix, filename) => {
  // Encode JPEG again
  const frameData = Buffer.alloc(imageMatrix.cols * imageMatrix.rows * 4); // Assumes grayscale
  for (let i = 0; i < imageMatrix.data.length; i += 1) {
    frameData[4 * i] = imageMatrix.data[i]; // red
    frameData[(4 * i) + 1] = imageMatrix.data[i]; // green
    frameData[(4 * i) + 2] = imageMatrix.data[i]; // blue
    frameData[(4 * i) + 3] = 0xFF; // alpha - ignored in JPEGs
  }

  dataToJpeg(filename, frameData, imageMatrix.cols, imageMatrix.rows);
};
