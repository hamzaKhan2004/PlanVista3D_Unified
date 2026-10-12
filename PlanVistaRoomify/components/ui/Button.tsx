import React from 'react'

interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: string
  size?: string
  fullWidth?: boolean
  className?: string
}

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  children,
  ...props
}) => {
  const baseClass = 'btn'
  const variantClass = `btn--${variant}`
  const sizeClass = `btn--${size}`
  const fullWidthClass = fullWidth ? 'btn--fullWidth' : ''
  const combinedClasses = `${baseClass} ${variantClass} ${sizeClass} ${fullWidthClass} ${className}`.trim()

  return (
    <button className={combinedClasses} {...props}>
      {children}
    </button>
  )
}

export default Button