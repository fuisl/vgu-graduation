"use client";

import { useEffect, useState } from "react";

const SNIPPETS = [
  {
    left: `model = build_model(config)
model.load_state_dict(checkpoint)
model.eval()
output = model(input)`,
    right: `tests = run_suite(model)
coverage = measure(tests)
assert coverage > threshold
deploy(model)`,
  },
  {
    left: `optimizer.zero_grad()
prediction = model(features)
loss = criterion(prediction, target)
loss.backward()
optimizer.step()`,
    right: `history.append(loss.item())
gradient = inspect(model)
learning_rate = schedule(step)
checkpoint(model)`,
  },
  {
    left: `spectrum = torch.fft.rfft(signal)
filtered = spectrum * frequency_mask
clean_signal = torch.fft.irfft(filtered)
transmit(clean_signal)`,
    right: `power = torch.mean(signal ** 2)
noise = estimate_noise(signal)
gain = calibrate(power, noise)
monitor(gain)`,
  },
  {
    left: `records = torch.tensor(dataset)
valid = torch.isfinite(records).all(dim=1)
batch = records[valid]
features = normalize(batch)`,
    right: `loader = DataLoader(batch)
for sample in loader:
    vector = encode(sample)
    store(vector)`,
  },
  {
    left: `returns = prices[1:] / prices[:-1] - 1
volatility = returns.std()
signal = model(returns)
risk_score = signal / (volatility + 1e-6)`,
    right: `scenarios = simulate(returns)
exposure = assess(scenarios)
limit = set_risk_budget(exposure)
rebalance(limit)`,
  },
  {
    left: `idea = torch.randn(1, latent_dim)
prototype = generator(idea)
feedback = evaluate(prototype)
idea = refine(idea, feedback)`,
    right: `variants = explore(idea)
for candidate in variants:
    result = test(candidate)
    learn(result)`,
  },
];

function CodePanel({ code, side, animate, departing }: {
  code: string;
  side: "left" | "right";
  animate: boolean;
  departing: boolean;
}) {
  const [visible, setVisible] = useState(animate ? 0 : code.length);

  useEffect(() => {
    if (!animate) return;
    let timer: number | undefined;
    let start: number | undefined;
    if (departing) {
      let next = code.length;
      timer = window.setInterval(() => {
        next = Math.max(0, next - 5);
        setVisible(next);
        if (next === 0) window.clearInterval(timer);
      }, 18);
    } else {
      start = window.setTimeout(() => {
        let next = 0;
        timer = window.setInterval(() => {
          next = Math.min(code.length, next + 2);
          setVisible(next);
          if (next === code.length) window.clearInterval(timer);
        }, 25);
      }, side === "right" ? 250 : 0);
    }
    return () => {
      if (start !== undefined) window.clearTimeout(start);
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [code, side, animate, departing]);

  const shown = animate ? code.slice(0, visible) : code;
  const parts = shown.split(/(\b[A-Za-z_]\w*(?=\())/g);

  return <pre className={`sculpture-code sculpture-code-${side}`} aria-hidden="true"><code>{parts.map((part, index) =>
    index % 2 ? <span className="sculpture-code-function" key={index}>{part}</span> : part,
  )}</code></pre>;
}

export function ShapeCodeBackdrop({ index, animate, departing }: {
  index: number;
  animate: boolean;
  departing: boolean;
}) {
  const snippets = SNIPPETS[index];
  return <>
    <CodePanel key={`left-${index}-${animate}`} code={snippets.left} side="left" animate={animate} departing={departing} />
    <CodePanel key={`right-${index}-${animate}`} code={snippets.right} side="right" animate={animate} departing={departing} />
  </>;
}
