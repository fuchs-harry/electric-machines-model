# Maschinenmodelle – design notes

`js/ui/machine-art.js` draws the machine cross sections procedurally (Canvas 2D only, no images).
`design/machine-gallery.html` previews every drawing animated, light and dark, 200–420 px.

## Principles

- **Colour = physical quantity, nothing else.** Iron, air, copper, commutator, brushes and magnets are
  neutral grays (N lighter, S darker, always lettered). Current, flux, torque/force, voltage and the
  three phases are the only coloured ink, using the app-wide tokens. Text is always ink/ink2.
- **Readability over realism.** 14 armature conductors, 12 stator slots, exaggerated air gap and
  magnet thickness so ⊙/⊗ symbols stay legible at 200 px. Hairlines 1–1.5 px; one faint lamination
  ring per iron part instead of textures.
- **Physics is literal.** All angles are "math" angles (counter-clockwise positive) and converted to
  canvas coordinates in one place, so the right-hand rule, F = I·l × B and the torque sense are
  computed, not hand-placed.

## Gleichstrommaschine (`drawDC`)

- 2-pole, N left / S right, brush axis vertical (= neutral zone). Conductors rotate with `theta`, the
  current pattern stays fixed in space: ⊗ under N, ⊙ under S for `ia > 0`; conductors within ±6° of the
  brush axis are drawn without current (commutating). Commutator segments rotate, brushes stay.
- `showFields`: three Φ arrows N→S (reverse for `phi < 0`), armature MMF Θ_A along the brush axis
  (points "down" for `ia > 0`, which gives counter-clockwise torque with Φ to the right).
- `showForces`: tangential force per conductor, length ∝ |ia·phi| × pole coverage (zero in the
  neutral zone), sense = sign(ia·phi). `torque` (optional) adds an arc between the pole tips.
- Types: `pm` = magnet arcs on the yoke; `fremd`/`neben` = wound poles with 5 thin turn layers;
  `reihen` = 2 thick layers. Coil current ⊙/⊗ from `ie` (defaults to `phi`). A small terminal badge in
  the bottom-right corner shows the circuit (separate, parallel, series, or magnet).

## PSM (`drawPSM`)

- Stator: 12 slots, 60° phase belts. Slot at electrical angle φ belongs to the phase whose
  axis ± 90° is within 30°; ⊙ for positive phase current on the "+90°" side. Phase axes 1/2/3 are
  dashed, labelled; slot digits repeat the phase number so colour is never the only cue.
- Rotor: surface magnets, N centred on the d-axis (`gamma / polePairs` mechanical); `polePairs = 2`
  gives 4 magnets and 6 slots per pole pair. Space vectors are drawn at angle/p so that they align
  with the drawn rotor; ψ_M (solid) is the "compass needle", ψ_S dashed, i_S and u_S solid.
- `mode: 'bldc'`: 60° Hall sectors (sector k centred at k·60° electrical, default from `gamma`),
  active sector tinted, caption names the conducting block A–F from the signs of i1..i3.
- `torque`: arc around the shaft starting at the d-axis and sweeping in the torque sense; its label
  sits inside the arc because that is the only region no vector can reach.
