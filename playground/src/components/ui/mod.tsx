import { Component, createSignal, JSX, onMount, Show } from "solid-js";

export { default as Loading } from "./Loading";

export const Card: Component<
  {
    ref?: HTMLDivElement;
    children: JSX.Element;
    title?: JSX.Element;
    class?: string;
    bodyClass?: string;
  }
> = (
  props,
) => {
  return (
    <div
      ref={props.ref}
      class={`card bg-base-100 shadow-xl ${props.class ?? ""}`}
    >
      <div class={`card-body h-full ${props.bodyClass ?? ""}`}>
        <Show when={props.title}>
          <div class="card-title">{props.title}</div>
        </Show>
        {props.children}
      </div>
    </div>
  );
};

export const Badge: Component<
  {
    children: JSX.Element;
    type?: "neutral" | "success" | "ghost";
    outline?: boolean;
    size?: "lg";
    onClick?: () => void;
  }
> = (
  props,
) => {
  const typeClass = ():
    | ""
    | "badge-neutral"
    | "badge-success"
    | "badge-ghost" => props.type ? `badge-${props.type}` : "";
  const outlineClass = () => props.outline ? "badge-outline" : "";
  const sizeType = (): "" | `badge-lg` =>
    props.size ? `badge-${props.size}` : "";

  return (
    <div
      class={[
        `badge`,
        typeClass(),
        outlineClass(),
        sizeType(),
        props.onClick ? "cursor-pointer select-none" : undefined,
      ].join(" ")}
      onClick={props.onClick}
    >
      {props.children}
    </div>
  );
};

export const Tabs: Component<{ children: JSX.Element; class?: string }> = (
  props,
) => {
  return (
    <div class={`tabs tabs-border ${props.class ?? ""}`}>
      {props.children}
    </div>
  );
};

export const Tab: Component<
  {
    children: JSX.Element;
    isActive?: boolean;
    onClick?: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
    size?: "lg" | "sm";
  }
> = (
  props,
) => {
  const size = (): "tab-lg" | "tab-sm" | "" =>
    props.size ? `tab-${props.size}` : "";
  return (
    <button
      class={`tab ${props.isActive ? "tab-active" : ""} ${size()}`}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
};

export const Join: Component<{ children: JSX.Element }> = (props) => (
  <div class="join">{props.children}</div>
);

export const Dropdown: Component<
  {
    summary: JSX.Element;
    children: JSX.Element;
    buttonClass?: string;
    contentClass?: string;
  }
> = (props) => {
  let labelEl!: HTMLLabelElement;
  let ulEl!: HTMLUListElement;

  onMount(() => {
    let isOpen = false;
    window.addEventListener("click", (ev) => {
      if (!isOpen) {
        if (ev.target === labelEl) {
          isOpen = true;
        }
        return;
      }
      labelEl.blur();
      ulEl.blur();
      isOpen = false;
    }, { capture: true });
  });

  return (
    <div class="dropdown">
      <label
        ref={labelEl}
        tabindex="0"
        class={`btn ${props.buttonClass ?? ""}`}
      >
        {props.summary}
      </label>
      <ul
        ref={ulEl}
        tabindex="0"
        class={`dropdown-content z-[1] menu p-2 shadow-sm bg-base-100 rounded-box ${
          props.contentClass ?? ""
        }`}
      >
        {props.children}
      </ul>
    </div>
  );
};

export const DropdownItem: Component<{ children: JSX.Element }> = (props) => {
  return <li>{props.children}</li>;
};

export const Button: Component<
  {
    type?: "neutral" | "primary" | "secondary" | "error";
    isJoinItem?: boolean;
    children?: JSX.Element;
    icon?: JSX.Element;
    size?: "sm" | "xs";
    shape?: "square" | "circle";
    hasOutline?: boolean;
    disabled?: boolean;
    loading?: boolean;
    onClick?: () => void;
  }
> = (props) => {
  const classes = () =>
    [
      (props.type ? `btn-${props.type}` : "") satisfies
        | ""
        | "btn-neutral"
        | "btn-primary"
        | "btn-secondary"
        | "btn-info"
        | "btn-error",
      props.isJoinItem ? "join-item" : "",
      (props.size ? `btn-${props.size}` : "") satisfies
        | ""
        | "btn-sm"
        | "btn-xs",
      (props.shape ? `btn-${props.shape}` : "") satisfies
        | ""
        | "btn-square"
        | "btn-circle",
      props.hasOutline ? "btn-outline" : "",
      props.disabled ? "btn-disabled" : "",
      props.loading ? "loading" : "",
    ].join(" ");

  return (
    <div
      class={`btn ${classes()}`}
      onClick={props.onClick}
    >
      {props.icon}
      {props.children}
    </div>
  );
};

export const LabelButton: Component<{
  type?: "info";
  for: string;
  class?: string;
  size?: "sm";
  children?: JSX.Element;
  onClick?: () => void;
}> = (props) => {
  const typeClass = (): "" | "btn-info" =>
    props.type ? `btn-${props.type}` : "";
  const sizeClass = (): "" | "btn-sm" => props.size ? `btn-${props.size}` : "";

  return (
    <label
      for={props.for}
      class={`btn ${typeClass()} ${sizeClass()} ${props.class ?? ""}`}
      onClick={props.onClick}
    >
      {props.children}
    </label>
  );
};

export const Input: Component<{
  class?: string;
  placeholder?: string;
  size?: "sm";
  setText: (text: string) => void;
}> = (props) => {
  const sizeClass = (): "" | "input-sm" =>
    props.size ? `input-${props.size}` : "";

  return (
    <input
      type="input"
      class={`input ${sizeClass()} w-full max-w-xs ${props.class ?? ""}`}
      placeholder={props.placeholder}
      onInput={(ev) => props.setText(ev.target.value)}
    />
  );
};

export const OptionalNumberInput: Component<
  {
    number: number;
    setNumber: (n: number) => void;
    enabled: boolean;
    setEnabled: (enabled: boolean) => void;
    children: JSX.Element;
  }
> = (props) => {
  return (
    <div class="flex justify-center items-center gap-2">
      <div class="flex flex-col h-full justify-center">
        <div class="form-control">
          <div class="label cursor-pointer">
            <span class="label-text">
              {props.children}
            </span>
            <span class="w-2" />
            <input
              type="checkbox"
              class="checkbox"
              checked={props.enabled}
              onChange={(ev) => props.setEnabled(ev.target.checked)}
            />
          </div>
        </div>
      </div>
      <div class="flex flex-col h-full justify-center">
        <input
          type="number"
          class="input input-sm"
          value={props.number}
          onInput={(ev) => props.setNumber(Number(ev.target.value))}
          disabled={!props.enabled}
        />
      </div>
    </div>
  );
};

export const Skeleton: Component = () => (
  <div class="w-full h-full bg-slate-700 animate-pulse" />
);

export const Collapse: Component<
  {
    title: JSX.Element;
    children: JSX.Element;
    bindOpen?: [() => boolean, (_: boolean) => void];
    defaultOpen?: boolean;
  }
> = (props) => {
  const [open, setOpen] = props.bindOpen ??
    createSignal(props.defaultOpen ?? false);

  return (
    <div class="collapse bg-base-200">
      <input
        type="checkbox"
        checked={open()}
        onChange={(ev) => setOpen(ev.target.checked)}
      />
      <div class="collapse-title text-xl font-medium">
        {props.title}
      </div>
      <div class="collapse-content">
        {props.children}
      </div>
    </div>
  );
};
