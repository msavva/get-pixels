'use strict'

var ndarray       = require('ndarray')
var path          = require('path')
var PNG           = require('pngjs').PNG
var jpeg          = require('jpeg-js')
var GifReader     = require('omggif').GifReader
var bmp           = require('bmp-js')
var tiff          = require('utif')
var TGA           = require('tga')
var PSD           = require('PSD') 
var fs            = require('fs')
var request       = require('request')
var mime          = require('mime-types')
var parseDataURI  = require('parse-data-uri')
var fileType      = require('file-type')

function print_pixels(array) {
  for (var h = 0; h < array.shape[0]; h++) {
     var line = [];   
     for (var w = 0; w < array.shape[1]; w++) {
      var c = [];
      for (var k = 0; k < array.shape[2]; k++) {
        c.push(array.get(h,w,k));
      }
      line.push(c.join(','));
     }
     console.log(line.join(' ')) 
     console.log('---') 
  }
}

function handlePNG(data, cb) {
  var png = new PNG();
  png.parse(data, function(err, img_data) {
    if(err) {
      cb(err)
      return
    }
    cb(null, ndarray(new Uint8Array(img_data.data),
      [img_data.width|0, img_data.height|0, 4],
      [4, 4*img_data.width|0, 1],
      0))
  })
}

function handleJPEG(data, cb) {
  var jpegData
  try {
    jpegData = jpeg.decode(data)
  }
  catch(e) {
    cb(e)
    return
  }
  if(!jpegData) {
    cb(new Error("Error decoding jpeg"))
    return
  }
  var nshape = [ jpegData.height, jpegData.width, 4 ]
  var result = ndarray(jpegData.data, nshape)
  cb(null, result.transpose(1,0))
}

function handleGIF(data, cb) {
  var reader
  try {
    reader = new GifReader(data)
  } catch(err) {
    cb(err)
    return
  }
  if(reader.numFrames() > 0) {
    var nshape = [reader.numFrames(), reader.height, reader.width, 4]
    var ndata = new Uint8Array(nshape[0] * nshape[1] * nshape[2] * nshape[3])
    var result = ndarray(ndata, nshape)
    try {
      for(var i=0; i<reader.numFrames(); ++i) {
        reader.decodeAndBlitFrameRGBA(i, ndata.subarray(
          result.index(i, 0, 0, 0),
          result.index(i+1, 0, 0, 0)))
      }
    } catch(err) {
      cb(err)
      return
    }
    cb(null, result.transpose(0,2,1))
  } else {
    var nshape = [reader.height, reader.width, 4]
    var ndata = new Uint8Array(nshape[0] * nshape[1] * nshape[2])
    var result = ndarray(ndata, nshape)
    try {
      reader.decodeAndBlitFrameRGBA(0, ndata)
    } catch(err) {
      cb(err)
      return
    }
    cb(null, result.transpose(1,0))
  }
}

function handleBMP(data, cb) {
  try {
    var bmpData = bmp.decode(data)
    var nshape = [ bmpData.height, bmpData.width, 4 ]
    var result = ndarray(new Uint8Array(bmpData.data), nshape);
    var hasAlpha = bmpData.is_with_alpha || (bmpData.bitPP === 32);
    for (var h = 0; h < bmpData.height; h++) {
     for (var w = 0; w < bmpData.width; w++) {
        if (!hasAlpha) {
          result.set(h,w,0,255); 
        }
        var tmp = result.get(h,w,0);
        result.set(h,w,0, result.get(h,w,3));
        result.set(h,w,3, tmp);
        tmp = result.get(h,w,1);
        result.set(h,w,1, result.get(h,w,2));
        result.set(h,w,2, tmp);
      } 
    }
    cb(null, result.transpose(1,0))
  } catch(e) {
    cb(e)
    return
  }
}

function handleTIFF(data, cb) {
  try {
    // TODO: tiffs can be multiple images
    var ifds = tiff.decode(data)
    tiff.decodeImages(data, ifds)
    var tiffData = ifds[0]
    var rgba  = tiff.toRGBA8(tiffData);
    var nshape = [ tiffData.height, tiffData.width, 4 ]
    var result = ndarray(rgba, nshape)
    cb(null, result.transpose(1,0))
  } catch(e) {
    cb(e)
    return
  }
}

function handleTGA(data, cb) {
  try {
    var tgaData = new TGA(data)
    var nshape = [ tgaData.height, tgaData.width, 4 ]
    var result = ndarray(new Uint8Array(tgaData.pixels), nshape)
    cb(null, result.transpose(1,0))
  } catch(e) {
    cb(e)
    return
  }
}

function handlePSD(data, cb) {
  try {
    var psd = new PSD(data);
    psd.parse();
    var nshape = [ psd.image.height(), psd.image.width(), 4 ]
    var result = ndarray(psd.image.pixelData, nshape)
    cb(null, result.transpose(1,0))
  } catch (e) {
    cb(e)
    return
  }
}

function doParse(mimeType, data, cb) {
  var mime = fileType(data);
  mimeType = mime ? mime.mime : mimeType;
  doParseVerified(mimeType, data, cb)
}

function doParseVerified(mimeType, data, cb) {
  if (mimeType != null) {
    mimeType = mimeType.toLowerCase();
  }
  switch(mimeType) {
    case 'image/png':
      handlePNG(data, cb)
    break

    case 'image/jpg':
    case 'image/jpeg':
      handleJPEG(data, cb)
    break

    case 'image/gif':
      handleGIF(data, cb)
    break

    case 'image/bmp':
      handleBMP(data, cb)
    break

    case 'image/x-targa':
    case 'image/targa':
    case 'image/x-tga':
    case 'image/tga':
      handleTGA(data, cb)
    break

    case 'image/tiff':
      handleTIFF(data, cb)
    break

    case 'image/vnd.adobe.photoshop':
      handlePSD(data, cb)
    break

    default:
      cb(new Error("Unsupported file type: " + mimeType))
  }
}

module.exports = function getPixels(url, type, cb) {
  if(!cb) {
    cb = type
    type = ''
  }
  if(Buffer.isBuffer(url)) {
    if(!type) {
      cb(new Error('Invalid file type'))
      return
    }
    doParse(type, url, cb)
  } else if(url.indexOf('data:') === 0) {
    try {
      var buffer = parseDataURI(url)
      if(buffer) {
        process.nextTick(function() {
          doParse(type || buffer.mimeType, buffer.data, cb)
        })
      } else {
        process.nextTick(function() {
          cb(new Error('Error parsing data URI'))
        })
      }
    } catch(err) {
      process.nextTick(function() {
        cb(err)
      })
    }
  } else if(url.indexOf('http://') === 0 || url.indexOf('https://') === 0) {
    request({url:url, encoding:null}, function(err, response, body) {
      if(err) {
        cb(err)
        return
      }

      type = type;
      if(!type){
        if(response.getHeader !== undefined){
	  type = response.getHeader('content-type');
	}else if(response.headers !== undefined){
	  type = response.headers['content-type'];
	}
      }
      if(!type) {
        cb(new Error('Invalid content-type'))
        return
      }
      doParse(type, body, cb)
    })
  } else {
    fs.readFile(url, function(err, data) {
      if(err) {
        cb(err)
        return
      }
      type = type || mime.lookup(url)
      if(!type) {
        cb(new Error('Invalid file type'))
        return
      }
      doParse(type, data, cb)
    })
  }
}
