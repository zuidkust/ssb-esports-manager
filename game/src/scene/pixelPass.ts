// 像素管线：低分辨率离屏渲染 + 深度描边 / 凸边提亮 + 调色板量化（4×4 Bayer，轻抖动）
// 画风对标《Corner Pitch》：描边只压暗物体自身的外缘像素（保留色相），朝外的棱提亮，
// 背景是浅灰渐变（不画进 3D，合成时按深度=1 的像素填）。像素粒度按 CSS 像素算，Retina 屏颗粒不会变细。
import * as THREE from 'three';

/** 特效图层（雨丝、水花）：只进颜色 pass，不进法线 pass。和 weather.ts 的 FX_LAYER 一致。 */
export const FX_LAYER = 1;

export type PixelSize = 2 | 3 | 4 | 5;
export type RenderMode = 'pixel' | 'raw';

// 漂浮街区（房间 + 四周人行道）在等距镜头下的可见范围（世界单位，按视平面量）
export const BASE_FRUSTUM = 17.5;
const BLOCK_VIEW_W = 24.5;

/** 垂直正交视锥。基准 17.5；竖屏或侧栏挤占时放大，把整块街区包进可见区域。 */
export function verticalFrustum(visibleAspect: number, base = BASE_FRUSTUM): number {
  const aspect = Math.max(0.35, visibleAspect);
  return Math.max(base, BLOCK_VIEW_W / aspect);
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

/**
 * 实际用的像素粒度：窄屏（手机）上按 CSS 像素算会太糊，保证可见区域至少约 200 列低分像素；
 * 桌面上就是用户选的 2 / 3 / 4 / 5。
 */
export function effectivePixelSize(chosen: number, visibleCssWidth: number): number {
  return Math.max(2, Math.min(chosen, Math.floor(visibleCssWidth / 200)));
}

export function parsePixelSize(value: string | null): PixelSize {
  const n = Number(value);
  return n === 2 || n === 3 || n === 4 || n === 5 ? n : 2;
}

/** `?raw3d=1` / `?render=raw` 启动即 RAW；`?pixel=2|3|4|5` 指定粒度（CSS 像素）。默认 PIXEL、粒度 2。 */
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
    depthRange: { value: 119.5 },
    bgTop: { value: new THREE.Color(0xcfd3d2) },
    bgBottom: { value: new THREE.Color(0xeceeed) },
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
    uniform float depthRange;
    uniform vec3 bgTop;
    uniform vec3 bgBottom;
    varying vec2 vUv;

    // toneMappingExposure 由 tonemapping_pars 声明。
    // colorspace_pars 由 WebGLProgram 前缀注入，这里再 include 会重复定义。
    #include <tonemapping_pars_fragment>

    // 描边阈值（米）：比它大的前后落差算轮廓
    const float EDGE_M = 0.22;
    // 每通道量化级数：够多，画面不出色带；配合很轻的 Bayer 只在渐变处出颗粒
    const float LEVELS = 32.0;

    float bayer4(vec2 pix) {
      int x = int(mod(pix.x, 4.0));
      int y = int(mod(pix.y, 4.0));
      mat4 m = mat4(
        0.0, 12.0, 3.0, 15.0,
        8.0, 4.0, 11.0, 7.0,
        2.0, 14.0, 1.0, 13.0,
        10.0, 6.0, 9.0, 5.0
      );
      return m[x][y] / 16.0;
    }

    float depthAt(vec2 uv, vec2 o) {
      return texture2D(tDepth, uv + o / lowRes).r * depthRange;
    }

    vec3 normalAt(vec2 uv, vec2 o) {
      return texture2D(tNormal, uv + o / lowRes).rgb * 2.0 - 1.0;
    }

    vec3 quantize(vec3 c, float b) {
      vec3 d = c + (b - 0.5) / LEVELS * 0.8;
      return clamp(floor(d * LEVELS + 0.5) / LEVELS, 0.0, 1.0);
    }

    void main() {
      vec2 pix = floor(vUv * lowRes);
      vec2 uv = (pix + 0.5) / lowRes;
      float b = bayer4(pix);
      float raw = texture2D(tDepth, uv).r;

      if (raw >= 0.99999) {
        vec3 bg = mix(bgBottom, bgTop, smoothstep(0.0, 1.0, vUv.y));
        gl_FragColor = vec4(quantize(bg, b), 1.0);
        return;
      }

      vec3 hdr = texture2D(tDiffuse, uv).rgb;
      vec3 color = sRGBTransferOETF(vec4(ACESFilmicToneMapping(hdr), 1.0)).rgb;
      // 视频的配色很“饱”：轻微提饱和
      float l = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(vec3(l), color, 1.1);

      float d = depthAt(uv, vec2(0.0));
      vec3 n = normalAt(uv, vec2(0.0));
      vec2 offs[4];
      offs[0] = vec2(1.0, 0.0);
      offs[1] = vec2(-1.0, 0.0);
      offs[2] = vec2(0.0, 1.0);
      offs[3] = vec2(0.0, -1.0);

      // 外轮廓：邻居明显更远 → 我是前景物体的边缘像素
      float depthEdge = 0.0;
      // 凸棱：同一块表面附近、法线拐过去且邻居稍远 → 朝外的棱，提亮
      float normalEdge = 0.0;
      for (int i = 0; i < 4; i++) {
        float dn = depthAt(uv, offs[i]);
        depthEdge += clamp((dn - d - EDGE_M) / EDGE_M, 0.0, 1.0);
        vec3 nn = normalAt(uv, offs[i]);
        float near = 1.0 - step(EDGE_M, abs(dn - d));
        float convex = smoothstep(-0.02, 0.02, dot(n - nn, vec3(1.0)));
        normalEdge += (1.0 - dot(n, nn)) * near * convex * step(d - 0.02, dn);
      }
      depthEdge = clamp(depthEdge, 0.0, 1.0);
      normalEdge = step(0.25, normalEdge);

      if (depthEdge > 0.0) color *= mix(1.0, 0.52, depthEdge);
      else color = mix(color, min(color * 1.32 + 0.03, vec3(1.0)), normalEdge * 0.85);

      gl_FragColor = vec4(quantize(clamp(color, 0.0, 1.0), b), 1.0);
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
    depth.type = THREE.UnsignedIntType;
    depth.minFilter = THREE.NearestFilter;
    depth.magFilter = THREE.NearestFilter;
    target.depthTexture = depth;
  }
  return target;
}

export class PixelPipeline {
  pixelSize: PixelSize = 2;
  lowWidth = 2;
  lowHeight = 2;
  private beauty: THREE.WebGLRenderTarget;
  private normals: THREE.WebGLRenderTarget;
  private material: THREE.ShaderMaterial;
  private quad: THREE.Mesh;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private normalMat = new THREE.MeshNormalMaterial({ flatShading: true });
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

  setBackdrop(top: THREE.Color, bottom: THREE.Color) {
    this.material.uniforms.bgTop.value.copy(top);
    this.material.uniforms.bgBottom.value.copy(bottom);
  }

  /** 低分缓冲按 CSS 像素算：pixelSize 个 CSS 像素 = 1 个低分像素，和屏幕像素比无关。 */
  setSize(cssWidth: number, cssHeight: number, size: number = this.pixelSize) {
    const low = lowResSize(Math.max(1, Math.floor(cssWidth)), Math.max(1, Math.floor(cssHeight)), size);
    this.lowWidth = low.w;
    this.lowHeight = low.h;
    this.beauty.setSize(low.w, low.h);
    this.normals.setSize(low.w, low.h);
    this.material.uniforms.lowRes.value.set(low.w, low.h);
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.OrthographicCamera, exposure: number) {
    const prevTarget = renderer.getRenderTarget();
    const prevOverride = scene.overrideMaterial;
    const prevBg = scene.background;
    renderer.getClearColor(this.clear);
    const prevAlpha = renderer.getClearAlpha();
    const prevTm = renderer.toneMapping;

    renderer.toneMapping = THREE.NoToneMapping;
    scene.background = null;
    renderer.setRenderTarget(this.beauty);
    renderer.render(scene, camera);

    // 法线 pass 不需要阴影：临时关掉阴影贴图更新，省一整轮阴影绘制；雨丝这类特效（FX 图层）也不画，免得被描边
    const autoShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    const layerMask = camera.layers.mask;
    camera.layers.disable(FX_LAYER);
    scene.overrideMaterial = this.normalMat;
    renderer.setClearColor(0x8080ff, 1);
    renderer.setRenderTarget(this.normals);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.shadowMap.autoUpdate = autoShadow;
    camera.layers.mask = layerMask;
    scene.overrideMaterial = prevOverride;
    scene.background = prevBg;
    renderer.setClearColor(this.clear, prevAlpha);

    const u = this.material.uniforms;
    u.tDiffuse.value = this.beauty.texture;
    u.tDepth.value = this.beauty.depthTexture;
    u.tNormal.value = this.normals.texture;
    u.depthRange.value = camera.far - camera.near;
    u.toneMappingExposure.value = exposure;
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
