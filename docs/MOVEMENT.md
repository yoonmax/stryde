# Movement rules

STRYDE's movement is a custom fixed-step controller. Rapier answers collision questions, and
everything about how the player moves lives in `src/player` and `src/abilities`. All tuning values
are in `src/config/movement.js`, with the reason for each beside it.

## Momentum: what is preserved, redirected, limited or lost

The design rule: **speed is only ever removed for a reason the player can see.**

| Transition | Rule | Where |
|---|---|---|
| Sprint to jump | Horizontal velocity untouched. Vertical is added. | `JumpSystem.groundJump` |
| Land to jump, within 110 ms | No friction is applied at all during this window. Nothing is lost. | `applyGround` (hop window) |
| Land, then stay down | Above sprint speed, friction is proportional and gentle, so speed bleeds off over about a second. | `applyGround` |
| Run to slide | Speed kept. A one-off boost is added if below 16 m/s and off cooldown. | `SlideSystem.begin` |
| Slide on a slope | Gravity acts along the surface. Downhill accelerates, uphill decays. | `SlideSystem.forces` |
| Slide on the flat | Low friction, rising after 1.1 s, so it always ends. | `SlideSystem.forces` |
| Slide to jump | Velocity kept. | `JumpSystem.groundJump` |
| Strafe keys in the air | Sideways velocity responds at the ground's rate, on a layer above momentum. Letting go removes exactly what it added. Combined speed can't exceed the larger layer, so it never adds speed. | `applyAir` |
| Landing, wall catch or taut rope while strafing | The strafe layer is taken out first, so a held key can't be banked as real speed. | `clearAirStrafe` |
| Air to wall | Tangential speed kept. Into-wall speed removed. | `WallRunSystem.enter` |
| Around a curved wall | The velocity is re-aimed along the new tangent at the same speed. | `WallRunSystem.sustain` |
| Inside corner | Speed is carried onto the new wall. | `WallRunSystem.turnCorner` |
| Wall jump | Tangential speed kept. Out and up added. | `WallRunSystem.launch` |
| Rope goes taut | Only the outward component is removed. Tangential speed stays. | `GrappleSystem.constrain` |
| Rope release | Velocity is untouched. | `GrappleSystem.release` |
| Air dash | Adds to velocity, so existing momentum survives. Gain falls off with speed along the dash. | `AirDashSystem.fire` |
| Catching a lip with the feet | The capsule steps up onto it at full speed instead of stopping dead. | `CharacterController.tryStep` |
| Just missing a ledge | Vault assist lifts the player and gives back the horizontal speed. | `Player.resolveVault` |
| Hitting a wall square-on | Speed into the wall is lost. That one is on you. | `CharacterController.clip` |
| Extreme speed | Quadratic drag above 42 m/s. There is no hard clamp. | `applySoftCap` |

## Rules that prevent exploits

Each of these has a test.

- **Slide spam:** the boost has a 1.4 s cooldown and a speed ceiling.
- **Ground strafing:** turning at overspeed cannot add speed.
- **Air-strafe banking:** the strafe layer is removed on landing, on a wall catch and on a taut rope, so
  holding a key through a chain of hops adds nothing.
- **Bunny-hop runaway:** the perfect-hop bonus is 0.35 m/s and stops at 21 m/s. Above that, hopping
  holds speed but can't raise it.
- **Infinite wall run:** a wall can't be re-used until the player touches ground or another wall.
  Timing out a wall run spends it outright, so a curved wall can't be re-latched. Facing walls can be
  climbed by alternating between them, and that is deliberate: the Flue sections are built on it.
- **Swing energy:** the rope solver can only lose energy. Input can add energy, but only up to 34 m/s.

## State model

Locomotion is one exclusive state: `GROUNDED`, `RUNNING`, `SLIDING`, `JUMPING`, `FALLING`,
`WALL_RUNNING`. Transitions go through an explicit table in `MovementStateMachine.js`, and an illegal
one is recorded rather than taken. The test suite asserts there are none, across every course route.

Grappling, dashing and landing are orthogonal. Each belongs to its own system, so "airborne and
grappling" or "wall-running with a slack rope" need no contradictory flags.

## The rope

The rope is a one-sided distance constraint solved on position:

```
x' = x + v dt
if |x' - a| > L:
    x' = a + L (x' - a) / |x' - a|
    v  = (x' - x) / dt
```

The corrected displacement is a chord of the rope sphere, and a chord is never longer than the step
that produced it, so a free swing cannot gain energy from the solver. There is no force at all while
the rope is slack. Reeling shortens `L`, and the same projection then does real work on the player,
which is why reeling in speeds up a swing.

## Tick order

Carry on platforms, resolve overlaps, ability decisions (grapple, dash, wall, slide, jump), forces,
rope constraint, soft cap, swept move, then ground and landing resolution. Same inputs give the same
trajectory; a test runs two simulations and compares them exactly.

## Ground rules for level building

- Solids stay under 700 m on a side. Rapier's shape casts were measured to lose accuracy past about
  1.5 km, so `LevelBuilder` refuses anything too large.
- Floor edges are not wall-runnable. Latching one by accident costs a player the run.
- Surfaces tell the player what they do: concrete wall-runs, graphite wall-runs and grapples, metal
  grapples, glass does neither, blue nodes always grapple.
