// BẢN 21: giảm tải GPU để ưu tiên điều khiển trên tablet.
// Không đổi theo loại máy, FPS hoặc trạng thái phòng chơi.
export const GRAPHICS = Object.freeze({
  pixelRatio: 1.5,
  shadowMapSize: 1024,
  sphereWidthSegments: 24,
  sphereHeightSegments: 16,
  cylinderRadialSegments: 20,
  labelCanvasScale: 2,
  grassTextureSize: 512,
  grassTextureAnisotropy: 4,
});
