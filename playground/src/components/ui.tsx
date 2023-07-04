import { Component, JSX, onMount } from "solid-js";

export const Card: Component<
  { children: JSX.Element; class?: string; bodyClass?: string }
> = (
  props,
) => {
  return (
    <div class={`card bg-base-100 shadow-xl ${props.class ?? ""}`}>
      <div class={`card-body h-full ${props.bodyClass ?? ""}`}>
        {props.children}
      </div>
    </div>
  );
};

export const Tabs: Component<{ children: JSX.Element; class?: string }> = (
  props,
) => {
  return (
    <div class={`tabs ${props.class ?? ""}`}>
      {props.children}
    </div>
  );
};

export const Tab: Component<
  {
    children: JSX.Element;
    isActive?: boolean;
    onClick?: JSX.EventHandlerUnion<HTMLDivElement, MouseEvent>;
    size?: "lg";
  }
> = (
  props,
) => {
  const size = (): "tab-lg" | "" => props.size ? `tab-${props.size}` : "";
  return (
    <div
      class={`tab ${props.isActive ? "tab-active" : ""} tab-bordered ${size()}`}
      onClick={props.onClick}
    >
      {props.children}
    </div>
  );
};

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
        class={`dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box ${
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
    type?: "primary" | "secondary" | "error";
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
        | "btn-primary"
        | "btn-secondary"
        | "btn-info"
        | "btn-error",
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
          class="input input-sm input-bordered"
          value={props.number}
          onInput={(ev) => props.setNumber(Number(ev.target.value))}
          disabled={!props.enabled}
        />
      </div>
    </div>
  );
};

export const Skeleton: Component = (props) => (
  <div class="w-full h-full bg-slate-700 animate-pulse" />
);
