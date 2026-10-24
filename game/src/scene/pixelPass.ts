// 像素管线：低分辨率离屏渲染 + 深度/法线描边 + 调色板量化（4×4 Bayer）
// 最终在全屏上按低分像素格取样，邻近放大，静态边缘不再亚像素闪烁。
import * as THREE from 'three';

export type PixelSize = 2 | 3 | 4;
export type RenderMode = 'pixel' | 'raw';

export const BASE_FRUSTUM = 14;
const ROOM_VIEW_H = 12.2;
const ROOM_VIEW_W = 17.2;

/** 垂直正交视锥。基准 14；竖屏或侧栏挤占时放大，把房间包进可见区域。 */
export function verticalFrustum(visibleAspect: number, base = BASE_FRUSTUM): number {
  const aspect = Math.max(0.35, visibleAspect);
  return Math.max(base, ROOM_VIEW_H, ROOM_VIEW_W / aspect);
}

export function lowResSize(width: number, height: number, pixelSize: number): { w: number; h: number } {
  const size = Math.max(1, pixelSize);
  return {
    w: Math.max(1, Math.floor(width / size)),
    h: Math.max(1, Math.floor(height / size)),
  };
}

/** 一个低分像素在视图平面上占多少世界单位。 */
export function worldUnitsPerPixel(frustumHeight: number, lowResHeight: number): number {
  return frustumHeight / Math.max(1, lowResHeight);
}

/** 视图坐标对齐到像素格后的位移（目标 - 当前）。 */
export function snapOffset(viewCoord: number, step: number): number {
  if (!(step > 0) || !Number.isFinite(viewCoord)) return 0;
  return Math.round(viewCoord / step) * step - viewCoord;
}

export function parsePixelSize(value: string | null): PixelSize {
  const n = Number(value);
  return n === 2 || n === 3 || n === 4 ? n : 3;
}

/** `?raw3d=1` / `?render=raw` 启动即 RAW；`?pixel=2|3|4` 指定粒度。默认 PIXEL、pixelSize 3。 */
export function parseRenderMode(search: string | URLSearchParams): { mode: RenderMode; pixelSize: PixelSize } {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const raw = params.get('raw3d') === '1' || params.get('render') === 'raw';
  return { mode: raw ? 'raw' : 'pixel', pixelSize: parsePixelSize(params.get('pixel')) };
}

const compositeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    tNormal: { value: null as THREE.Texture | null },
    lowRes: { value: new THREE.Vector2(320, 180) },
    toneMappingExposure: { value: 1 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform sampler2D tNormal;
    uniform vec2 lowRes;
    varying vec2 vUv;

    // toneMappingExposure 由 tonemapping_pars 声明。
    // colorspace_pars 由 WebGLProgram 前缀注入，这里再 include 会重复定义。
    #include <tonemapping_pars_fragment>

    vec2 snapUv() {
      return (floor(vUv * lowRes) + 0.5) / lowRes;
    }

    float depthAt(vec2 uv, ivec2 o) {
      vec2 texel = 1.0 / lowRes;
      return texture2D(tDepth, uv + vec2(o) * texel).r;
    }

    vec3 normalAt(vec2 uv, ivec2 o) {
      vec2 texel = 1.0 / lowRes;
      vec3 n = texture2D(tNormal, uv + vec2(o) * texel).rgb * 2.0 - 1.0;
      return normalize(n + 1e-6);
    }

    float bayer4(vec2 pix) {
      int x = int(mod(pix.x, 4.0));
      int y = int(mod(pix.y, 4.0));
      // 标准 4×4 Bayer，mat4 按列填充
      mat4 m = mat4(
        0.0, 12.0, 3.0, 15.0,
        8.0, 4.0, 11.0, 7.0,
        2.0, 14.0, 1.0, 13.0,
        10.0, 6.0, 9.0, 5.0
      );
      return m[x][y] / 16.0;
    }

    void main() {
      vec2 uv = snapUv();
      vec2 pix = floor(vUv * lowRes);
      vec3 hdr = texture2D(tDiffuse, uv).rgb;
      vec3 mapped = ACESFilmicToneMapping(hdr);
      vec3 color = sRGBTransferOETF(vec4(mapped, 1.0)).rgb;

      float d = depthAt(uv, ivec2(0, 0));
      float gap = 0.0;
      float span = 0.0;
      float d1 = depthAt(uv, ivec2(1, 0));
      float d2 = depthAt(uv, ivec2(-1, 0));
      float d3 = depthAt(uv, ivec2(0, 1));
      float d4 = depthAt(uv, ivec2(0, -1));
      gap = max(gap, d - d1);
      gap = max(gap, d - d2);
      gap = max(gap, d - d3);
      gap = max(gap, d - d4);
      span = max(span, abs(d - d1));
      span = max(span, abs(d - d2));
      span = max(span, abs(d - d3));
      span = max(span, abs(d - d4));
      float depthEdge = step(0.0025, gap);

      vec3 n = normalAt(uv, ivec2(0, 0));
      float nd = dot(n, normalAt(uv, ivec2(1, 0)));
      nd = min(nd, dot(n, normalAt(uv, ivec2(-1, 0))));
      nd = min(nd, dot(n, normalAt(uv, ivec2(0, 1))));
      nd = min(nd, dot(n, normalAt(uv, ivec2(0, -1))));
      float normalEdge = step(nd, 0.599);

      if (depthEdge > 0.5) {
        color = mix(color * 0.30, vec3(0.07843, 0.09412, 0.14118), 0.72);
      } else if (normalEdge > 0.5 && span < 0.0025) {
        color *= n.y > 0.05 ? 1.12 : 0.80;
      }

      float b = bayer4(pix);
      vec3 dithered = color + (b - 0.5) * (1.0 / 32.0);
      const float LEVELS = 7.0;
      float luma = dot(max(dithered, vec3(0.0)), vec3(0.2126, 0.7152, 0.0722));
      float lumaQ = floor(clamp(luma, 0.0, 1.0) * LEVELS + 0.5) / LEVELS;
      vec3 chroma = dithered - vec3(luma);
      vec3 chromaQ = floor(chroma * 16.0 + 0.5) / 16.0;
      gl_FragColor = vec4(clamp(vec3(lumaQ) + chromaQ, 0.0, 1.0), 1.0);
    }
  `,
};

function makeTarget(width: number, height: number, withDepth: boolean): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type: THREE.HalfFloatType,
    depthBuffer: true,
    generateMipmaps: false,
  });
  target.texture.colorSpace = THREE.LinearSRGBColorSpace;
  if (withDepth) {
    const depth = new THREE.DepthTexture(width, height);
    depth.format = THREE.DepthFormat;
    depth.type = THREE.UnsignedShortType;
    depth.minFilter = THREE.NearestFilter;
    depth.magFilter = THREE.NearestFilter;
    target.depthTexture = depth;
  }
  return target;
}

export class PixelPipeline {
  pixelSize: PixelSize = 3;
  lowWidth = 2;
  lowHeight = 2;
  private beauty: THREE.WebGLRenderTarget;
  private normals: THREE.WebGLRenderTarget;
  private material: THREE.ShaderMaterial;
  private quad: THREE.Mesh;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private normalMat = new THREE.MeshNormalMaterial();
  private clear = new THREE.Color();

  constructor() {
    this.beauty = makeTarget(2, 2, true);
    this.normals = makeTarget(2, 2, false);
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(compositeShader.uniforms),
      vertexShader: compositeShader.vertexShader,
      fragmentShader: compositeShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    this.normalMat.toneMapped = false;
  }

  setPixelSize(size: PixelSize) {
    this.pixelSize = size;
  }

  setSize(cssWidth: number, cssHeight: number, pixelRatio: number) {
    const bufW = Math.max(1, Math.floor(cssWidth * pixelRatio));
    const bufH = Math.max(1, Math.floor(cssHeight * pixelRatio));
    const low = lowResSize(bufW, bufH, this.pixelSize);
    this.lowWidth = low.w;
    this.lowHeight = low.h;
    this.beauty.setSize(low.w, low.h);
    this.normals.setSize(low.w, low.h);
    this.material.uniforms.lowRes.value.set(low.w, low.h);
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, exposure: number) {
    const prevTarget = renderer.getRenderTarget();
    const prevOverride = scene.overrideMaterial;
    const prevBg = scene.background;
    renderer.getClearColor(this.clear);
    const prevAlpha = renderer.getClearAlpha();
    const prevTm = renderer.toneMapping;

    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setRenderTarget(this.beauty);
    renderer.render(scene, camera);

    scene.background = null;
    scene.overrideMaterial = this.normalMat;
    renderer.setClearColor(0x8080ff, 1);
    renderer.setRenderTarget(this.normals);
    renderer.clear();
    renderer.render(scene, camera);
    scene.overrideMaterial = prevOverride;
    scene.background = prevBg;
    renderer.setClearColor(this.clear, prevAlpha);

    this.material.uniforms.tDiffuse.value = this.beauty.texture;
    this.material.uniforms.tDepth.value = this.beauty.depthTexture;
    this.material.uniforms.tNormal.value = this.normals.texture;
    this.material.uniforms.toneMappingExposure.value = exposure;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setRenderTarget(null);
    renderer.render(this.quadScene, this.quadCam);

    renderer.toneMapping = prevTm;
    renderer.setRenderTarget(prevTarget);
  }

  dispose() {
    this.beauty.dispose();
    this.normals.dispose();
    this.material.dispose();
    this.normalMat.dispose();
    this.quad.geometry.dispose();
  }
}
