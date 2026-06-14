import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { useTradingStore } from '../store/useTradingStore'

/**
 * 全局 3D 流体背景
 *
 * 与交易状态的映射关系：
 *   - uMood       0 → 平稳盈利：青蓝色平滑呼吸流体
 *                 1 → 大幅回撤：赤橙色激荡形态
 *   - uTurbulence 行情波动率 → 域扭曲（domain warping）强度与流速
 *
 * 所有 uniform 不直接赋值，而在每帧向 store 中的目标值做指数阻尼趋近
 * （临界阻尼 ≈ 物理弹簧的平滑落点），保证情绪切换永远是非线性的。
 */

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0); // 全屏平面，跳过相机矩阵
  }
`

const FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uMood;       // 0 青蓝 .. 1 赤橙
  uniform float uTurbulence; // 0 平静 .. 1 激荡
  uniform vec2 uRes;

  // ── 值噪声 + fbm ──────────────────────────────────────────
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.55;
    mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 5; i++) {
      v += amp * noise(p);
      p = rot * p * 2.02;
      amp *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    uv.x *= uRes.x / max(uRes.y, 1.0);

    // 波动越大流速越快、扭曲越深
    float speed = 0.05 + uTurbulence * 0.22;
    float warp = 1.0 + uTurbulence * 3.0;
    float t = uTime * speed;

    // 双层域扭曲：q 扭曲 r，r 再扭曲最终场 —— 经典流体质感
    vec2 q = vec2(fbm(uv + t), fbm(uv + vec2(5.2, 1.3) - t * 0.7));
    vec2 r = vec2(
      fbm(uv + warp * q + vec2(1.7, 9.2) + 0.15 * t),
      fbm(uv + warp * q + vec2(8.3, 2.8) - 0.12 * t)
    );
    float f = fbm(uv + warp * r);

    // 两套色板：盈利的深海青蓝 / 回撤的熔岩赤橙
    vec3 calmDeep  = vec3(0.012, 0.035, 0.078);
    vec3 calmMid   = vec3(0.020, 0.220, 0.330);
    vec3 calmHi    = vec3(0.130, 0.900, 1.000);
    vec3 hotDeep   = vec3(0.060, 0.015, 0.020);
    vec3 hotMid    = vec3(0.420, 0.080, 0.040);
    vec3 hotHi     = vec3(1.000, 0.380, 0.140);

    vec3 deep = mix(calmDeep, hotDeep, uMood);
    vec3 mid  = mix(calmMid,  hotMid,  uMood);
    vec3 hi   = mix(calmHi,   hotHi,   uMood);

    vec3 col = mix(deep, mid, clamp(f * f * 2.4, 0.0, 1.0));
    col = mix(col, hi, clamp(length(q) * 0.55, 0.0, 1.0) * (0.25 + 0.45 * uMood + 0.25 * uTurbulence));

    // 呼吸感：平静时缓慢明暗起伏，激荡时呼吸加快变浅
    float breath = 0.88 + 0.12 * sin(uTime * (0.5 + uTurbulence * 1.6));
    col *= breath;

    // 暗角，让玻璃面板浮于流体之上
    float vig = smoothstep(1.45, 0.35, length(vUv - 0.5) * 1.9);
    col *= vig;

    gl_FragColor = vec4(col, 1.0);
  }
`

function FluidPlane() {
  const matRef = useRef<THREE.ShaderMaterial>(null)
  const { size } = useThree()

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMood: { value: 0.35 },
      uTurbulence: { value: 0.15 },
      uRes: { value: new THREE.Vector2(1, 1) },
    }),
    [],
  )

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05) // 避免切后台回来时跳帧
    const target = useTradingStore.getState().fluid
    const u = matRef.current?.uniforms
    if (!u) return
    u.uTime.value += dt
    // 指数阻尼趋近目标（非线性、带"落点呼吸感"）
    const k = 1 - Math.exp(-dt * 1.6)
    u.uMood.value += (target.mood - u.uMood.value) * k
    u.uTurbulence.value += (target.turbulence - u.uTurbulence.value) * k
    u.uRes.value.set(size.width, size.height)
  })

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={VERTEX}
        fragmentShader={FRAGMENT}
        uniforms={uniforms}
        depthWrite={false}
      />
    </mesh>
  )
}

/** WebGL 能力探测：远程桌面 / 企业策略 / 老显卡环境下优雅降级 */
function supportsWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

/** R3F Canvas 创建上下文仍可能在探测通过后失败（GPU 进程崩溃等），错误边界兜底防止整树卸载 */
class FluidErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/**
 * 无 WebGL 时的纯 CSS 星云替身：保住暗夜基调与霓虹氛围。
 * 同时给 <html> 打上 low-fx 标记 —— 无 GPU 意味着软件渲染，
 * 多层 backdrop-filter 会拖垮合成器（实测可致 rAF 冻结），全局降级关闭。
 */
function StaticNebula() {
  useEffect(() => {
    document.documentElement.classList.add('low-fx')
    return () => document.documentElement.classList.remove('low-fx')
  }, [])
  return (
    <div
      className="absolute inset-0"
      style={{
        background:
          'radial-gradient(60rem 40rem at 18% 8%, rgba(20,120,160,0.16), transparent 60%),' +
          'radial-gradient(50rem 36rem at 85% 90%, rgba(150,60,30,0.10), transparent 65%),' +
          'radial-gradient(40rem 30rem at 70% 25%, rgba(34,230,255,0.05), transparent 60%),' +
          '#05070d',
      }}
    />
  )
}

/**
 * 层级融合策略：
 *   z-0  固定定位的 WebGL 流体层（pointer-events: none，不抢交互）
 *   z-10 主体 UI / 图表层，玻璃面板用 backdrop-filter 对流体取样折射
 *   局部辉光元素用 mix-blend-mode: screen 与流体做加色混合
 */
export function FluidBackground() {
  const [webglOk] = useState(supportsWebGL)

  return (
    <div className="fixed inset-0 z-0 pointer-events-none">
      {webglOk ? (
        <FluidErrorBoundary fallback={<StaticNebula />}>
          <Canvas
            dpr={[1, 1.5]}
            gl={{ antialias: false, powerPreference: 'high-performance' }}
            style={{ width: '100%', height: '100%' }}
          >
            <FluidPlane />
          </Canvas>
        </FluidErrorBoundary>
      ) : (
        <StaticNebula />
      )}
      {/* 网格薄纱：科技感扫描线，screen 混合叠在流体上 */}
      <div
        className="absolute inset-0"
        style={{
          mixBlendMode: 'screen',
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(120,180,255,0.022) 0 1px, transparent 1px 56px), repeating-linear-gradient(90deg, rgba(120,180,255,0.022) 0 1px, transparent 1px 56px)',
        }}
      />
    </div>
  )
}
